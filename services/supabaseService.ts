
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { OnlinePayload, UserProfile } from '../types';

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private userId: string;
  private userName: string = "玩家";
  private currentUrl: string = "";
  private currentKey: string = "";

  constructor() {
    // Generate or retrieve persistent User ID (Simulates a "User Table" locally)
    let storedId = localStorage.getItem('xiangqi_user_id');
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('xiangqi_user_id', storedId);
    }
    this.userId = storedId;
    
    // Retrieve Name
    const storedName = localStorage.getItem('xiangqi_user_name');
    if (storedName) this.userName = storedName;

    this.initClient();
  }

  setUserName(name: string) {
    this.userName = name;
    localStorage.setItem('xiangqi_user_name', name);
  }

  getUserProfile(): UserProfile {
    return { id: this.userId, name: this.userName };
  }

  private initClient() {
    const defaultUrl = "https://pfrgahyizaqdgxdxchet.supabase.co";
    const defaultKey = "sb_publishable_VGFBipmkBKimCiKieUQxnw_mVqt3kFI";

    this.currentUrl = localStorage.getItem('VITE_SUPABASE_URL') || process.env.VITE_SUPABASE_URL || defaultUrl;
    this.currentKey = localStorage.getItem('VITE_SUPABASE_ANON_KEY') || process.env.VITE_SUPABASE_ANON_KEY || defaultKey;

    if (this.currentUrl && this.currentKey) {
      try {
        this.client = createClient(this.currentUrl, this.currentKey);
      } catch (e) {
        console.error("Invalid Supabase Credentials", e);
        this.client = null;
      }
    }
  }

  getCredentials() {
      return { url: this.currentUrl, key: this.currentKey };
  }

  updateCredentials(url: string, key: string) {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    this.initClient();
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  generateRoomCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // --- PACKING/UNPACKING LOGIC to avoid SQL Migration ---
  
  // We store extended data (history, players, meta) INSIDE the 'pieces' JSONB column.
  // DB 'pieces' content: { board: Piece[], history: Move[], players: GamePlayers, meta: GameMeta }
  // DB 'turn', 'last_move', 'winner' remain as separate columns for easier debugging/indexing if needed.

  private unpackState(dbRow: any): OnlinePayload {
      const piecesVal = dbRow.pieces;
      let board: any[] = [];
      let history: any[] = [];
      let players = { red: null, black: null, spectators: [] };
      let meta = { last_move_ts: Date.now(), undo_requester: null, helper_id: null };

      // Handle legacy format (array) vs new packed format (object)
      if (Array.isArray(piecesVal)) {
          board = piecesVal;
      } else if (piecesVal && typeof piecesVal === 'object') {
          board = piecesVal.board || [];
          history = piecesVal.history || [];
          if (piecesVal.players) players = piecesVal.players;
          if (piecesVal.meta) meta = piecesVal.meta;
      }

      // Ensure spectators array exists
      if (!players.spectators) players.spectators = [];

      return {
          pieces: board,
          turn: dbRow.turn as any,
          last_move: dbRow.last_move,
          winner: dbRow.winner,
          history,
          players: players as any,
          meta: meta as any
      };
  }

  private packPiecesColumn(state: Partial<OnlinePayload>, currentPiecesVal: any): any {
      // Reconstruct the full packed object from partial update + existing data
      let base = { 
          board: [], 
          history: [], 
          players: { red: null, black: null, spectators: [] }, 
          meta: { last_move_ts: Date.now(), undo_requester: null, helper_id: null } 
      };

      if (Array.isArray(currentPiecesVal)) {
          base.board = currentPiecesVal;
      } else if (currentPiecesVal && typeof currentPiecesVal === 'object') {
          base = { ...base, ...currentPiecesVal };
      }

      // Merge new state
      if (state.pieces) base.board = state.pieces as any;
      if (state.history) base.history = state.history as any;
      if (state.players) base.players = state.players as any;
      if (state.meta) base.meta = state.meta as any;

      return base;
  }

  // ------------------------------------------------------

  async createRoom(roomId: string, initialState: OnlinePayload): Promise<boolean> {
    if (!this.client) return false;

    // Pack extended fields into 'pieces' column
    const packedPieces = {
        board: initialState.pieces,
        history: initialState.history,
        players: initialState.players,
        meta: initialState.meta
    };

    const { error } = await this.client
      .from('games')
      .insert({
        id: roomId,
        pieces: packedPieces, 
        turn: initialState.turn,
        last_move: initialState.last_move,
        winner: initialState.winner
      });

    if (error) {
        console.error("Supabase Create Error:", error);
        return false;
    }
    return true;
  }

  async getRoomState(roomId: string): Promise<{ data: OnlinePayload | null, error?: string }> {
      if (!this.client) return { data: null, error: "Not Configured" };
      
      const { data, error } = await this.client.from('games').select('*').eq('id', roomId).single();
      
      if(error) {
          console.error("Supabase Get Room Error:", error);
          if (error.code === 'PGRST116') return { data: null }; // Not found
          return { data: null, error: error.message };
      }
      return { data: this.unpackState(data) };
  }

  async joinRoom(roomId: string): Promise<OnlinePayload | null> {
    const res = await this.getRoomState(roomId);
    return res.data;
  }

  async updateGameState(roomId: string, state: Partial<OnlinePayload>) {
    if (!this.client) return;

    // 1. Fetch current 'pieces' column to merge packed data
    const { data: currentData, error } = await this.client.from('games').select('pieces').eq('id', roomId).single();
    if (error || !currentData) return;

    // 2. Pack the partial update into the JSON structure
    const newPackedPieces = this.packPiecesColumn(state, currentData.pieces);

    // 3. Prepare Update Payload
    const updatePayload: any = {
        pieces: newPackedPieces
    };
    
    // Update separate columns if they are present in the partial state
    if (state.turn) updatePayload.turn = state.turn;
    if (state.last_move !== undefined) updatePayload.last_move = state.last_move;
    if (state.winner !== undefined) updatePayload.winner = state.winner;

    await this.client.from('games').update(updatePayload).eq('id', roomId);
  }

  subscribeToGame(roomId: string, onUpdate: (state: OnlinePayload) => void) {
    if (!this.client) return;
    if (this.channel) this.client.removeChannel(this.channel);

    this.channel = this.client
      .channel(`game:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${roomId}` },
        (payload) => {
          // Unpack the new state from the raw DB row
          const newState = this.unpackState(payload.new);
          onUpdate(newState);
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.client && this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

export const supabaseService = new SupabaseService();
