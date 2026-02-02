
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BoardPiece } from './components/BoardPiece';
import { INITIAL_PIECES } from './constants';
import { Piece, Side, Move, Position, GameMode, PlayerRole, OnlinePayload, UserProfile } from './types';
import { isValidMove, getPieceAt, reconstructBoard } from './utils/gameLogic';
import { liveService } from './services/liveService';
import { supabaseService } from './services/supabaseService';

// --- CONSTANTS ---
const TURN_TIME_LIMIT = 3 * 60 * 1000; // 3 minutes

// --- UTILS ---
const formatTime = (ms: number) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  // --- STATE: LOCAL UI ---
  const [userProfile, setUserProfile] = useState<UserProfile>({ id: '', name: '' });
  const [hasSetProfile, setHasSetProfile] = useState(false);
  const [inputName, setInputName] = useState('');
  
  // --- STATE: GAME ---
  const [pieces, setPieces] = useState<Piece[]>(INITIAL_PIECES);
  const [turn, setTurn] = useState<Side>(Side.RED);
  const [history, setHistory] = useState<Move[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  
  // --- STATE: META & ONLINE ---
  const [gameMode, setGameMode] = useState<GameMode>('local');
  const [roomId, setRoomId] = useState<string>('');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [onlineStatus, setOnlineStatus] = useState<string>('');
  const [myRole, setMyRole] = useState<PlayerRole>(Side.RED);
  const [onlineData, setOnlineData] = useState<OnlinePayload | null>(null);

  // --- STATE: UI FLAGS ---
  const [isLobbyOpen, setIsLobbyOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoleSelect, setShowRoleSelect] = useState(false); 
  const [showCreateSideSelect, setShowCreateSideSelect] = useState(false); // New: Modal for side selection
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [config, setConfig] = useState({ sbUrl: '', sbKey: '' });
  
  // Notification State
  const [showStartNotification, setShowStartNotification] = useState(false);
  const wasGameFull = useRef(false);

  // Join Room UI State
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // --- LIVE API ---
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveStatus, setLiveStatus] = useState("AI 助手准备就绪");
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isFlipped = gameMode === 'online' && myRole === Side.BLACK;

  // --- INIT ---
  useEffect(() => {
    const profile = supabaseService.getUserProfile();
    setUserProfile(profile);
    setInputName(profile.name);
    if (profile.name && profile.name !== '玩家') {
        setHasSetProfile(true);
    }
    const creds = supabaseService.getCredentials();
    setConfig({ sbUrl: creds.url, sbKey: creds.key });
  }, []);

  // --- TIMER LOGIC ---
  useEffect(() => {
    if (gameMode !== 'online' || !onlineData || winner) return;

    // Wait for both players
    const isFull = !!onlineData.players.red && !!onlineData.players.black;
    if (!isFull) {
        setTimeLeft(TURN_TIME_LIMIT);
        return;
    }

    const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - onlineData.meta.last_move_ts;
        const remaining = TURN_TIME_LIMIT - elapsed;
        
        setTimeLeft(remaining);

        // Timeout Logic (Only active player triggers it to avoid race conditions)
        if (remaining <= 0 && turn === myRole && !winner) {
            handleTimeout();
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [onlineData, turn, myRole, gameMode, winner]);

  // --- GAME START NOTIFICATION ---
  useEffect(() => {
      if (!onlineData) return;
      const isFull = !!onlineData.players.red && !!onlineData.players.black;
      
      // If transitioned from not full to full
      if (!wasGameFull.current && isFull) {
          setShowStartNotification(true);
          const timer = setTimeout(() => setShowStartNotification(false), 3000);
          return () => clearTimeout(timer);
      }
      wasGameFull.current = isFull;
  }, [onlineData]);

  const handleTimeout = () => {
      if (!onlineData) return;
      
      const isRed = turn === Side.RED;
      const nextTurn = isRed ? Side.BLACK : Side.RED;
      
      // Update timeouts count
      const updatedPlayers = { ...onlineData.players };
      let newWinner = null;

      if (isRed && updatedPlayers.red) {
          updatedPlayers.red.timeouts = (updatedPlayers.red.timeouts || 0) + 1;
          if (updatedPlayers.red.timeouts >= 3) newWinner = Side.BLACK; 
      } else if (!isRed && updatedPlayers.black) {
          updatedPlayers.black.timeouts = (updatedPlayers.black.timeouts || 0) + 1;
          if (updatedPlayers.black.timeouts >= 3) newWinner = Side.RED; 
      }

      const newState: Partial<OnlinePayload> = {
          turn: nextTurn,
          players: updatedPlayers,
          meta: {
              ...onlineData.meta,
              last_move_ts: Date.now()
          },
          winner: newWinner
      };
      
      supabaseService.updateGameState(roomId, newState);
  };

  // --- DRAWING ---
  const drawBoardToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !boardRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 450; const h = 500;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = '#dcb35c'; ctx.fillRect(0, 0, w, h);
    
    // Simple visual for AI
    pieces.forEach(p => {
        if(p.dead) return;
        const cellW = w/9; const cellH = h/10;
        const x = p.position.x * cellW + cellW/2;
        const y = p.position.y * cellH + cellH/2;
        ctx.fillStyle = p.side === Side.RED ? 'red' : 'black';
        ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fill();
    });
  }, [pieces]);

  useEffect(() => { drawBoardToCanvas(); }, [drawBoardToCanvas]);

  // --- ONLINE SUBSCRIPTION ---
  useEffect(() => {
    if (gameMode === 'online' && roomId) {
        // 1. Subscribe for future updates
        supabaseService.subscribeToGame(roomId, (newState) => {
            setOnlineData(newState);
            setPieces(newState.pieces);
            setTurn(newState.turn);
            setWinner(newState.winner);
            setHistory(newState.history || []);
        });

        // 2. SAFETY NET: Fetch latest state immediately to ensure we didn't miss
        // the "Player Joined" event while the component was mounting/subscribing.
        supabaseService.getRoomState(roomId).then(({ data }) => {
            if (data) {
                setOnlineData(data);
                setPieces(data.pieces);
                setTurn(data.turn);
                setWinner(data.winner);
                setHistory(data.history || []);
            }
        });
    }
    return () => supabaseService.unsubscribe();
  }, [gameMode, roomId, myRole]);


  // --- GAME ACTIONS ---
  const handleSquareClick = (pos: Position) => {
    if (winner) return;

    // Permissions
    let canMove = false;
    if (gameMode === 'local') canMove = true;
    else {
        // Must be your turn and game must be full (started)
        if (turn === myRole && onlineData?.players.red && onlineData?.players.black) canMove = true;
        // Spectator Helper Permission
        if (onlineData?.meta.helper_id === userProfile.id) canMove = true;
    }

    if (!canMove) return;

    const clickedPiece = getPieceAt(pieces, pos);
    
    // Select
    if (clickedPiece && clickedPiece.side === turn) {
      if (gameMode === 'online' && clickedPiece.side !== myRole && onlineData?.meta.helper_id !== userProfile.id) return;
      setSelectedId(clickedPiece.id);
      return;
    }

    // Move
    if (selectedId) {
      const selectedPiece = pieces.find(p => p.id === selectedId);
      if (selectedPiece && isValidMove(selectedPiece, pos, pieces)) {
        executeMove(selectedPiece, pos);
      } else {
        setSelectedId(null);
      }
    }
  };

  const executeMove = (piece: Piece, to: Position) => {
    const targetPiece = getPieceAt(pieces, to);
    const nextTurn = turn === Side.RED ? Side.BLACK : Side.RED;
    const move: Move = { from: piece.position, to, capturedId: targetPiece?.id, ts: Date.now() };

    // Optimistic Update
    const newPieces = pieces.map(p => {
      if (p.id === piece.id) return { ...p, position: to };
      if (targetPiece && p.id === targetPiece.id) return { ...p, dead: true, position: { x: -1, y: -1 } };
      return p;
    });

    let newWinner = winner;
    if (targetPiece?.type === 'GENERAL') newWinner = turn;

    const newHistory = [...history, move];

    setPieces(newPieces);
    setHistory(newHistory);
    setSelectedId(null);
    setTurn(nextTurn);
    setWinner(newWinner);

    if (gameMode === 'online' && onlineData) {
        supabaseService.updateGameState(roomId, {
            pieces: newPieces,
            turn: nextTurn,
            last_move: move,
            history: newHistory,
            winner: newWinner,
            meta: {
                last_move_ts: Date.now(),
                undo_requester: null,
                helper_id: null // Reset helper after move
            }
        });
    }
  };

  // --- UNDO LOGIC ---
  const requestUndo = () => {
      if (gameMode !== 'online' || !onlineData) {
          // Local Undo
          if(history.length === 0) return;
          const newHistory = history.slice(0, -1);
          const prevPieces = reconstructBoard(newHistory);
          setPieces(prevPieces);
          setHistory(newHistory);
          setTurn(turn === Side.RED ? Side.BLACK : Side.RED);
          setWinner(null);
          return;
      }
      
      supabaseService.updateGameState(roomId, {
          meta: { ...onlineData.meta, undo_requester: myRole as Side }
      });
  };

  const respondToUndo = (accept: boolean) => {
      if (!onlineData) return;
      
      if (!accept) {
          supabaseService.updateGameState(roomId, {
             meta: { ...onlineData.meta, undo_requester: null }
          });
      } else {
          // Perform Undo
          const newHistory = onlineData.history.slice(0, -1);
          const prevPieces = reconstructBoard(newHistory);
          const prevTurn = onlineData.turn === Side.RED ? Side.BLACK : Side.RED;
          
          supabaseService.updateGameState(roomId, {
              pieces: prevPieces,
              history: newHistory,
              turn: prevTurn,
              winner: null,
              last_move: newHistory[newHistory.length - 1] || null,
              meta: {
                  ...onlineData.meta,
                  undo_requester: null,
                  last_move_ts: Date.now()
              }
          });
      }
  };

  // --- HELPER LOGIC ---
  const requestHelp = (spectatorId: string) => {
      // Only active player can ask for help
      if (turn !== myRole) return;
      if (!onlineData) return;
      
      const newHelper = onlineData.meta.helper_id === spectatorId ? null : spectatorId;

      supabaseService.updateGameState(roomId, {
          meta: { ...onlineData.meta, helper_id: newHelper }
      });
  };

  // --- LOBBY ACTIONS ---
  const saveProfile = () => {
      if(!inputName.trim()) return alert("请输入昵称");
      supabaseService.setUserName(inputName);
      setUserProfile({ ...userProfile, name: inputName });
      setHasSetProfile(true);
  };
  
  const saveConfig = () => {
    supabaseService.updateCredentials(config.sbUrl, config.sbKey);
    setShowSettings(false);
  };

  const handleCreateRoom = async (side: Side) => {
      if(!supabaseService.isConfigured()) { setShowSettings(true); return; }
      
      // Close modal
      setShowCreateSideSelect(false);

      const code = supabaseService.generateRoomCode();
      const initialPayload: OnlinePayload = {
          pieces: INITIAL_PIECES,
          turn: Side.RED,
          last_move: null,
          history: [],
          winner: null,
          players: {
              red: side === Side.RED ? { ...userProfile, timeouts: 0, joined: true } : null,
              black: side === Side.BLACK ? { ...userProfile, timeouts: 0, joined: true } : null,
              spectators: []
          },
          meta: {
              last_move_ts: Date.now(),
              undo_requester: null,
              helper_id: null
          }
      };

      setOnlineStatus(`正在创建房间 ${code}...`);
      if (await supabaseService.createRoom(code, initialPayload)) {
          setGameMode('online');
          setRoomId(code);
          setMyRole(side);
          setOnlineData(initialPayload);
          setIsLobbyOpen(false);
          setOnlineStatus(`房间: ${code}`);
      } else {
          setOnlineStatus("创建失败！");
          alert("创建失败。请检查 Supabase 表结构是否包含 history/players/meta 字段，或查看控制台错误信息。");
      }
  };

  const handleCheckRoom = async () => {
      setJoinError('');
      if(!supabaseService.isConfigured()) { setShowSettings(true); return; }
      
      const cleanId = inputRoomId.trim();
      if (!cleanId) {
          setJoinError("请输入房间号");
          return;
      }
      if (cleanId.length !== 4) {
          setJoinError("房间号需为4位数字");
          return;
      }
      
      setIsJoining(true);
      const result = await supabaseService.getRoomState(cleanId);
      setIsJoining(false);
      
      if (result.error) {
          setJoinError(`查询失败: ${result.error}`);
          return;
      }
      
      if (!result.data) {
          setJoinError("房间不存在，请检查号码");
          return;
      }
      
      setOnlineData(result.data);
      setShowRoleSelect(true);
  };

  const handleJoinRole = async (role: PlayerRole) => {
      if (!onlineData) return;
      
      const updatedPlayers = { ...onlineData.players };
      // Deep clone check before mutating
      if (!updatedPlayers.spectators) updatedPlayers.spectators = [];

      let myNewRole = role;

      if (role === Side.RED) {
          if (updatedPlayers.red) return alert("该位置已被抢占");
          updatedPlayers.red = { ...userProfile, timeouts: 0, joined: true };
      } else if (role === Side.BLACK) {
          if (updatedPlayers.black) return alert("该位置已被抢占");
          updatedPlayers.black = { ...userProfile, timeouts: 0, joined: true };
      } else {
          // Avoid dups
          if (!updatedPlayers.spectators.find(s => s.id === userProfile.id)) {
             updatedPlayers.spectators.push(userProfile);
          }
          myNewRole = 'SPECTATOR';
      }

      // Check if game is becoming full (Starting) to reset start time
      let metaUpdate = {};
      if (
          (role === Side.RED && updatedPlayers.black) || 
          (role === Side.BLACK && updatedPlayers.red)
      ) {
          metaUpdate = { last_move_ts: Date.now() };
      }

      const updatePayload: any = { players: updatedPlayers };
      if (Object.keys(metaUpdate).length > 0) {
          updatePayload.meta = { ...onlineData.meta, ...metaUpdate };
      }
      
      const cleanId = inputRoomId.trim() || roomId;
      
      // 1. OPTIMISTIC UPDATE: Update local state immediately before network request
      // This ensures that when the view switches, the user sees "Connected" immediately
      // and permissions are granted even if the subscription event is delayed.
      const newOnlineData = { 
          ...onlineData, 
          players: updatedPlayers,
          meta: { ...onlineData.meta, ...metaUpdate }
      };
      setOnlineData(newOnlineData);

      // 2. Network Request
      await supabaseService.updateGameState(cleanId, updatePayload);
      
      setGameMode('online');
      setRoomId(cleanId);
      setMyRole(myNewRole);
      setPieces(newOnlineData.pieces);
      setHistory(newOnlineData.history);
      setIsLobbyOpen(false);
      setShowRoleSelect(false);
  };

  const toggleLive = async () => {
    if (isLiveConnected) {
      liveService.disconnect();
      setIsLiveConnected(false);
      setLiveStatus("AI 已断开");
    } else {
      if (!canvasRef.current) return;
      setLiveStatus("连接中...");
      try {
        await liveService.connect({
            onOpen: () => { setIsLiveConnected(true); setLiveStatus("特级大师在线"); },
            onMessage: () => {},
            onClose: () => { setIsLiveConnected(false); setLiveStatus("已断开"); },
            onError: (e) => { setIsLiveConnected(false); setLiveStatus("错误: " + e.message); }
        }, canvasRef.current);
      } catch (e) {
        setLiveStatus("连接失败");
      }
    }
  };

  // --- RENDER HELPERS ---
  const renderLobby