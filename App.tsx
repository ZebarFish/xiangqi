
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BoardPiece } from './components/BoardPiece';
import { INITIAL_PIECES } from './constants';
import { Piece, Side, Move, Position, GameMode, PlayerRole, OnlinePayload, UserProfile } from './types';
import { isValidMove, getPieceAt, reconstructBoard, isGeneralInCheck } from './utils/gameLogic';
import { liveService } from './services/liveService';
import { supabaseService } from './services/supabaseService';
import { webrtcService } from './services/webrtcService';

// --- CONSTANTS ---
const TURN_TIME_LIMIT = 3 * 60 * 1000; // 3 minutes

// --- SOUND ASSETS ---
const SOUND_MOVE = "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/sound/standard/Move.mp3";
const SOUND_CAPTURE = "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/sound/standard/Capture.mp3";

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
  const [isInCheck, setIsInCheck] = useState(false);
  
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
  const [showCreateSideSelect, setShowCreateSideSelect] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [config, setConfig] = useState({ sbUrl: '', sbKey: '' });
  
  // Notification State
  const [showStartNotification, setShowStartNotification] = useState(false);
  const hasShownStartNotification = useRef(false);
  const prevHistoryLength = useRef(0);

  // Audio Refs
  const moveSoundRef = useRef<HTMLAudioElement>(null);
  const captureSoundRef = useRef<HTMLAudioElement>(null);

  // Join Room UI State
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // --- LIVE API (AI) ---
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveStatus, setLiveStatus] = useState("准备就绪");
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- WEBRTC (VIDEO CHAT) ---
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

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

  // --- SOUND & CHECK EFFECT ---
  useEffect(() => {
    if (history.length > 0 && history.length > prevHistoryLength.current) {
        const lastMove = history[history.length - 1];
        const isCapture = !!lastMove.capturedId;

        const audio = isCapture ? captureSoundRef.current : moveSoundRef.current;
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log("Sound play error", e));
        }

        const check = isGeneralInCheck(pieces, turn);
        setIsInCheck(check);

        if (check && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance("将军");
            utterance.lang = 'zh-CN';
            window.speechSynthesis.speak(utterance);
        }
    } else if (history.length === 0) {
        setIsInCheck(false);
    }
    prevHistoryLength.current = history.length;
  }, [history, pieces, turn]);


  // --- TIMER LOGIC ---
  useEffect(() => {
    if (gameMode !== 'online' || !onlineData || winner) return;

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
      const currentHistoryLen = onlineData.history.length;
      
      if (isFull && currentHistoryLen === 0 && !hasShownStartNotification.current) {
          setShowStartNotification(true);
          hasShownStartNotification.current = true;
          // When game starts, enable video automatically if online
          if (!isVideoEnabled) toggleVideoChat();
      }
  }, [onlineData]);

  useEffect(() => {
      if (showStartNotification) {
          const timer = setTimeout(() => setShowStartNotification(false), 2000);
          return () => clearTimeout(timer);
      }
  }, [showStartNotification]);

  const handleTimeout = () => {
      if (!onlineData) return;
      
      const isRed = turn === Side.RED;
      const nextTurn = isRed ? Side.BLACK : Side.RED;
      
      const updatedPlayers = JSON.parse(JSON.stringify(onlineData.players));
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
          meta: { ...onlineData.meta, last_move_ts: Date.now() },
          winner: newWinner
      };
      supabaseService.updateGameState(roomId, newState);
  };

  // --- DRAWING FOR AI ---
  const drawBoardToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !boardRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 450; const h = 500;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = '#dcb35c'; ctx.fillRect(0, 0, w, h);
    
    pieces.forEach(p => {
        if(p.dead) return;
        const cellW = w/9; const cellH = h/10;
        const x = p.position.x * cellW + cellW/2;
        const y = p.position.y * cellH + cellH/2;
        ctx.fillStyle = p.side === Side.RED ? 'red' : 'black';
        ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fill();
        // Simple letter representation for AI vision
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(p.type[0], x-4, y+4);
    });
  }, [pieces]);

  useEffect(() => { drawBoardToCanvas(); }, [drawBoardToCanvas]);

  // --- ONLINE SUBSCRIPTION & WEBRTC SIGNALING ---
  useEffect(() => {
    if (gameMode === 'online' && roomId) {
        const handleStateUpdate = (newState: OnlinePayload) => {
            setOnlineData(newState);
            setPieces(newState.pieces);
            setTurn(newState.turn);
            setWinner(newState.winner);
            setHistory(newState.history || []);
        };

        const channel = supabaseService.subscribeToGame(roomId, handleStateUpdate);

        supabaseService.getRoomState(roomId).then(({ data }) => {
            if (data) handleStateUpdate(data);
        });

        // Initialize WebRTC Listener on the same channel
        if (channel) {
            webrtcService.init(channel, userProfile.id, (stream) => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                    remoteVideoRef.current.play().catch(e => console.error("Remote video play error", e));
                }
            });
            // Try to connect if we are joining a room with people
            webrtcService.requestConnection(userProfile.id);
        }
    }
    return () => {
        supabaseService.unsubscribe();
        webrtcService.cleanup();
    };
  }, [gameMode, roomId, myRole]);


  // --- GAME ACTIONS ---
  const handleSquareClick = (pos: Position) => {
    if (winner) return;

    let canMove = false;
    if (gameMode === 'local') canMove = true;
    else {
        if (turn === myRole && onlineData?.players.red && onlineData?.players.black) canMove = true;
        if (onlineData?.meta.helper_id === userProfile.id) canMove = true;
    }

    if (!canMove) return;

    const clickedPiece = getPieceAt(pieces, pos);
    
    if (clickedPiece && clickedPiece.side === turn) {
      if (gameMode === 'online' && clickedPiece.side !== myRole && onlineData?.meta.helper_id !== userProfile.id) return;
      setSelectedId(clickedPiece.id);
      return;
    }

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
                ...onlineData.meta,
                last_move_ts: Date.now(),
                undo_requester: null,
                helper_id: null
            }
        });
    }
  };

  const requestUndo = () => {
      if (gameMode !== 'online' || !onlineData) {
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
          supabaseService.updateGameState(roomId, { meta: { ...onlineData.meta, undo_requester: null } });
      } else {
          const newHistory = onlineData.history.slice(0, -1);
          const prevPieces = reconstructBoard(newHistory);
          const prevTurn = onlineData.turn === Side.RED ? Side.BLACK : Side.RED;
          supabaseService.updateGameState(roomId, {
              pieces: prevPieces,
              history: newHistory,
              turn: prevTurn,
              winner: null,
              last_move: newHistory[newHistory.length - 1] || null,
              meta: { ...onlineData.meta, undo_requester: null, last_move_ts: Date.now() }
          });
      }
  };

  const handleRestart = async () => {
      const freshPieces = JSON.parse(JSON.stringify(INITIAL_PIECES));
      
      if (gameMode === 'online' && onlineData) {
          const initialPlayers = { ...onlineData.players };
          if (initialPlayers.red) initialPlayers.red.timeouts = 0;
          if (initialPlayers.black) initialPlayers.black.timeouts = 0;
          
          await supabaseService.updateGameState(roomId, {
              pieces: freshPieces,
              turn: Side.RED,
              last_move: null,
              history: [],
              winner: null,
              players: initialPlayers,
              meta: { last_move_ts: Date.now(), undo_requester: null, helper_id: null }
          });
      } else {
          setPieces(freshPieces);
          setTurn(Side.RED);
          setHistory([]);
          setWinner(null);
          setSelectedId(null);
          setTimeLeft(TURN_TIME_LIMIT);
      }
  };

  const requestHelp = (spectatorId: string) => {
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
          meta: { last_move_ts: Date.now(), undo_requester: null, helper_id: null }
      };

      setOnlineStatus(`正在创建房间 ${code}...`);
      if (await supabaseService.createRoom(code, initialPayload)) {
          hasShownStartNotification.current = false;
          setGameMode('online');
          setRoomId(code);
          setMyRole(side);
          setOnlineData(initialPayload);
          setIsLobbyOpen(false);
          setOnlineStatus(`房间: ${code}`);
      } else {
          setOnlineStatus("创建失败！");
          alert("创建失败。请检查 Supabase 设置。");
      }
  };

  const handleCheckRoom = async () => {
      setJoinError('');
      if(!supabaseService.isConfigured()) { setShowSettings(true); return; }
      
      const cleanId = inputRoomId.trim();
      if (cleanId.length !== 4) { setJoinError("房间号需为4位数字"); return; }
      
      setIsJoining(true);
      const result = await supabaseService.getRoomState(cleanId);
      setIsJoining(false);
      
      if (result.error) { setJoinError(`查询失败: ${result.error}`); return; }
      if (!result.data) { setJoinError("房间不存在"); return; }
      
      setOnlineData(result.data);
      setShowRoleSelect(true);
  };

  const handleJoinRole = async (role: PlayerRole) => {
      if (!onlineData) return;
      const updatedPlayers = JSON.parse(JSON.stringify(onlineData.players));
      if (!updatedPlayers.spectators) updatedPlayers.spectators = [];

      let myNewRole = role;

      if (role === Side.RED) {
          updatedPlayers.red = { ...userProfile, timeouts: updatedPlayers.red?.timeouts || 0, joined: true };
      } else if (role === Side.BLACK) {
          updatedPlayers.black = { ...userProfile, timeouts: updatedPlayers.black?.timeouts || 0, joined: true };
      } else {
          if (!updatedPlayers.spectators.find((s: UserProfile) => s.id === userProfile.id)) {
             updatedPlayers.spectators.push(userProfile);
          }
          myNewRole = 'SPECTATOR';
      }

      const metaUpdate: any = {};
      if ((role === Side.RED && updatedPlayers.black) || (role === Side.BLACK && updatedPlayers.red)) {
          metaUpdate.last_move_ts = Date.now();
      }

      hasShownStartNotification.current = false;
      const newOnlineData = { 
          ...onlineData, 
          players: updatedPlayers,
          meta: { ...onlineData.meta, ...metaUpdate }
      };
      setOnlineData(newOnlineData);
      
      const cleanId = inputRoomId.trim() || roomId;
      await supabaseService.updateGameState(cleanId, {
          players: updatedPlayers,
          meta: newOnlineData.meta
      });
      
      setGameMode('online');
      setRoomId(cleanId);
      setMyRole(myNewRole);
      setPieces(newOnlineData.pieces);
      setHistory(newOnlineData.history);
      setIsLobbyOpen(false);
      setShowRoleSelect(false);
  };

  const exitRoom = () => {
    setIsLobbyOpen(true);
    supabaseService.unsubscribe();
    webrtcService.cleanup();
    setIsVideoEnabled(false);
    setOnlineData(null);
    setRoomId('');
    setHistory([]);
    setPieces(INITIAL_PIECES);
    setWinner(null);
    setTurn(Side.RED);
    if (isLiveConnected) toggleLive();
  };

  // --- VIDEO & AI HELPERS ---
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

  const toggleVideoChat = async () => {
      if (isVideoEnabled) {
          webrtcService.cleanup();
          setIsVideoEnabled(false);
      } else {
          try {
              const stream = await webrtcService.startLocalStream();
              if (localVideoRef.current) {
                  localVideoRef.current.srcObject = stream;
                  localVideoRef.current.muted = true; // Mute self to prevent echo
                  localVideoRef.current.play().catch(console.error);
              }
              webrtcService.requestConnection(userProfile.id);
              setIsVideoEnabled(true);
          } catch (e) {
              alert("无法访问摄像头或麦克风");
          }
      }
  };

  // --- RENDER HELPERS ---
  const renderLobby = () => {
      // (Keep existing lobby render logic, just condensed for brevity in diff)
      // Note: Re-using the logic from the previous file content provided by user to ensure consistency
      // I am outputting the full file content as requested.
      const isMyRed = onlineData?.players.red?.id === userProfile.id;
      const isMyBlack = onlineData?.players.black?.id === userProfile.id;

      return (
    <div className="min-h-screen bg-stone-200 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-sm sm:max-w-md text-center border-4 border-[#8b5a2b] relative">
            <button onClick={() => setShowSettings(!showSettings)} className="absolute top-3 right-3 text-stone-300 hover:text-stone-500 p-2 z-10">⚙️</button>
            <h1 className="text-3xl font-extrabold text-stone-800 mb-2 mt-6 tracking-wide">亲情象棋</h1>
            {showSettings ? (
                 <div className="text-left animate-fade-in py-4">
                    <h2 className="text-xl font-bold mb-4 text-[#8b5a2b]">设置 Supabase</h2>
                    <input className="w-full border mb-2 p-3 rounded-lg" placeholder="URL" value={config.sbUrl} onChange={e => setConfig({...config, sbUrl: e.target.value})} />
                    <input className="w-full border mb-4 p-3 rounded-lg" placeholder="Key" value={config.sbKey} onChange={e => setConfig({...config, sbKey: e.target.value})} />
                    <div className="flex gap-2">
                        <button onClick={() => setShowSettings(false)} className="flex-1 bg-stone-200 py-3 rounded-lg">取消</button>
                        <button onClick={saveConfig} className="flex-1 bg-green-600 text-white py-3 rounded-lg">保存</button>
                    </div>
                 </div>
            ) : !hasSetProfile ? (
                <div className="animate-fade-in py-4">
                    <p className="mb-4 text-stone-500">请设置您的昵称：</p>
                    <input className="w-full border-2 p-3 rounded-xl mb-6 text-center text-lg" value={inputName} onChange={e => setInputName(e.target.value)} placeholder="例如：老爸"/>
                    <button onClick={saveProfile} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold">进入游戏</button>
                </div>
            ) : showRoleSelect && onlineData ? (
                <div className="animate-fade-in py-2">
                    <h2 className="text-xl font-bold mb-6">选择位置 ({inputRoomId})</h2>
                    <div className="flex flex-col gap-3">
                        <button disabled={!!onlineData.players.red && !isMyRed} onClick={() => handleJoinRole(Side.RED)} className={`p-4 rounded-xl border-2 font-bold ${onlineData.players.red && !isMyRed ? 'bg-gray-100 text-gray-400' : 'bg-red-50 border-red-500 text-red-700'}`}>{onlineData.players.red ? (isMyRed ? "🔴 回到游戏" : `红方: ${onlineData.players.red.name} (已占)`) : "🔴 加入红方"}</button>
                        <button disabled={!!onlineData.players.black && !isMyBlack} onClick={() => handleJoinRole(Side.BLACK)} className={`p-4 rounded-xl border-2 font-bold ${onlineData.players.black && !isMyBlack ? 'bg-gray-100 text-gray-400' : 'bg-stone-800 text-white'}`}>{onlineData.players.black ? (isMyBlack ? "⚫ 回到游戏" : `黑方: ${onlineData.players.black.name} (已占)`) : "⚫ 加入黑方"}</button>
                        <button onClick={() => handleJoinRole('SPECTATOR')} className="p-4 bg-yellow-100 border-2 border-yellow-200 rounded-xl font-bold">👀 观战</button>
                        <button onClick={() => setShowRoleSelect(false)} className="mt-4 text-sm text-stone-400">返回</button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-6 animate-fade-in mt-2">
                    <div className="text-stone-600">你好, <span className="font-bold text-black">{userProfile.name}</span></div>
                    <button onClick={() => { setGameMode('local'); setIsLobbyOpen(false); }} className="w-full bg-[#5d5650] text-white py-4 rounded-lg font-bold">本地对战</button>
                    <div className="space-y-2">
                        <p className="text-sm font-bold text-[#8b5a2b] text-left">在线对战</p>
                        <button onClick={() => { if(!supabaseService.isConfigured()) { setShowSettings(true); return; } setShowCreateSideSelect(true); }} className="w-full bg-gradient-to-b from-[#d92e2e] to-[#b01e1e] text-white py-4 rounded-xl font-bold shadow-lg">⚔️ 创建新房间</button>
                        <div className="mt-4 flex gap-3">
                            <input className="flex-1 border-2 px-4 py-3 rounded-xl text-center" placeholder="房间号" maxLength={4} value={inputRoomId} onChange={e => { setInputRoomId(e.target.value); setJoinError(''); }} />
                            <button onClick={handleCheckRoom} disabled={isJoining} className="bg-[#4f46e5] text-white px-6 rounded-xl font-bold">{isJoining ? "..." : "加入"}</button>
                        </div>
                        {joinError && <div className="text-red-500 text-sm">{joinError}</div>}
                    </div>
                </div>
            )}
            {showCreateSideSelect && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-3">
                        <h3 className="text-xl font-bold mb-4">选择执棋方</h3>
                        <button onClick={() => handleCreateRoom(Side.RED)} className="w-full py-4 rounded-xl bg-red-50 text-red-700 font-bold">执红 (先手)</button>
                        <button onClick={() => handleCreateRoom(Side.BLACK)} className="w-full py-4 rounded-xl bg-stone-800 text-white font-bold">执黑 (后手)</button>
                        <button onClick={() => setShowCreateSideSelect(false)} className="w-full py-3 text-stone-500">取消</button>
                    </div>
                </div>
            )}
        </div>
    </div>
      );
  };

  if (isLobbyOpen) return renderLobby();
  
  const lastMove = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div className="min-h-screen bg-stone-200 flex flex-col items-center py-2 font-sans select-none overflow-hidden touch-none relative">
      
      {/* Audio & Video Elements */}
      <audio ref={moveSoundRef} src={SOUND_MOVE} preload="auto" crossOrigin="anonymous" />
      <audio ref={captureSoundRef} src={SOUND_CAPTURE} preload="auto" crossOrigin="anonymous" />
      
      {/* --- VIDEO CHAT OVERLAY --- */}
      {isVideoEnabled && (
        <div className="fixed top-20 right-2 z-50 flex flex-col gap-2 pointer-events-none">
             {/* Remote Video (Big) */}
             <div className="w-32 h-44 bg-black rounded-lg shadow-xl overflow-hidden border-2 border-white relative pointer-events-auto">
                 <video ref={remoteVideoRef} className="w-full h-full object-cover" autoPlay playsInline />
                 <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1 rounded">对方</div>
             </div>
             {/* Local Video (Small PiP) */}
             <div className="w-20 h-28 bg-stone-800 rounded-lg shadow-lg overflow-hidden border border-stone-500 relative pointer-events-auto">
                 <video ref={localVideoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                 <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1 rounded">我</div>
             </div>
        </div>
      )}

      {/* --- NOTIFICATIONS & MODALS --- */}
      {gameMode === 'online' && onlineData?.meta.undo_requester && onlineData.meta.undo_requester !== myRole && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
              <div className="bg-white p-6 rounded-2xl shadow-xl text-center w-full max-w-xs animate-scale-up">
                  <h3 className="text-xl font-bold mb-2">对方请求悔棋</h3>
                  <div className="flex gap-3 mt-4">
                      <button onClick={() => respondToUndo(false)} className="flex-1 py-3 bg-red-100 text-red-700 rounded-xl font-bold">拒绝</button>
                      <button onClick={() => respondToUndo(true)} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold">同意</button>
                  </div>
              </div>
          </div>
      )}

      {showStartNotification && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-[70] animate-bounce-in">
            <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-yellow-300 scale-125">
                <h1 className="text-4xl font-black">对战开始!</h1>
            </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <div className="w-full max-w-md px-2 flex justify-between items-center text-xs sm:text-sm mb-2">
          <button onClick={exitRoom} className="bg-stone-500 text-white px-3 py-1.5 rounded-lg shadow-sm">← 退出</button>
          
          <div className="font-mono bg-white px-3 py-1 rounded-lg border border-stone-200 text-stone-600 font-bold shadow-sm">
             房号: <span className="text-[#8b5a2b]">{roomId || '本地'}</span>
          </div>
          
          <div className={`font-mono text-lg font-bold min-w-[3rem] text-right ${timeLeft < 10000 ? 'text-red-600 animate-pulse' : 'text-stone-700'}`}>
             {formatTime(timeLeft)}
          </div>
      </div>

      <div className="w-full max-w-md px-4 flex justify-between items-end mb-2">
         {gameMode === 'online' && onlineData ? (
             <div className="flex flex-col items-center w-full">
                 <div className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm border ${myRole === Side.RED ? 'bg-stone-800 text-white border-stone-600' : 'bg-red-50 text-red-800 border-red-200'}`}>
                     <span className="opacity-70 text-xs">对手:</span>
                     <span>{myRole === Side.RED ? onlineData.players.black?.name || "..." : onlineData.players.red?.name || "..."}</span>
                 </div>
             </div>
         ) : <div className="h-8"></div>}
      </div>

      {/* --- CHESS BOARD --- */}
      <div className={`relative w-full max-w-[90vw] md:max-w-[450px] aspect-[9/10] shadow-2xl rounded bg-[#dcb35c] transition-transform duration-500 ${isFlipped ? 'rotate-180' : ''}`} ref={boardRef}>
          <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
             <rect x="0" y="0" width="100" height="100" fill="#dcb35c" />
             <rect x="2.5" y="2.5" width="95" height="95" fill="none" stroke="#000" strokeWidth="0.8" />
             {Array.from({length: 10}).map((_, i) => <line key={`h-${i}`} x1={5.55} y1={5+i*10} x2={94.45} y2={5+i*10} stroke="#000" strokeWidth="0.3" />)}
             {Array.from({length: 9}).map((_, i) => <line key={`v-${i}`} x1={5.55+i*11.11} y1={5} x2={5.55+i*11.11} y2={45} stroke="#000" strokeWidth="0.3" />)}
             {Array.from({length: 9}).map((_, i) => <line key={`v2-${i}`} x1={5.55+i*11.11} y1={55} x2={5.55+i*11.11} y2={95} stroke="#000" strokeWidth="0.3" />)}
             <line x1={5.55} y1={45} x2={5.55} y2={55} stroke="#000" strokeWidth="0.3" />
             <line x1={94.45} y1={45} x2={94.45} y2={55} stroke="#000" strokeWidth="0.3" />
             <line x1={38.88} y1={5} x2={61.1} y2={25} stroke="#000" strokeWidth="0.3" />
             <line x1={61.1} y1={5} x2={38.88} y2={25} stroke="#000" strokeWidth="0.3" />
             <line x1={38.88} y1={95} x2={61.1} y2={75} stroke="#000" strokeWidth="0.3" />
             <line x1={61.1} y1={95} x2={38.88} y2={75} stroke="#000" strokeWidth="0.3" />
             <text x="25" y="50" fontSize="5" fontFamily="serif" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">楚 河</text>
             <text x="75" y="50" fontSize="5" fontFamily="serif" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">漢 界</text>
          </svg>
          
          <div className="absolute inset-0 z-10 grid grid-rows-10 grid-cols-9">
            {[...Array(90)].map((_, idx) => (
                <div key={idx} className="w-full h-full" onClick={() => handleSquareClick({x: idx%9, y: Math.floor(idx/9)})} />
            ))}
          </div>
          
          {lastMove && (
              <>
                 <div className="absolute z-0 w-[11.11%] h-[10%] flex items-center justify-center pointer-events-none" style={{ left: `${lastMove.from.x * 11.11}%`, top: `${lastMove.from.y * 10}%` }}>
                     <div className="w-1.5 h-1.5 bg-blue-600 rounded-full shadow-sm ring-4 ring-blue-600/20"></div>
                 </div>
                 <div className="absolute z-0 w-[11.11%] h-[10%] pointer-events-none flex items-center justify-center" style={{ left: `${lastMove.to.x * 11.11}%`, top: `${lastMove.to.y * 10}%` }}>
                    <div className="w-full h-full border-2 border-blue-600 rounded bg-blue-500/10"></div>
                 </div>
              </>
          )}

          {pieces.map(piece => !piece.dead && (
            <BoardPiece key={piece.id} piece={piece} isSelected={selectedId === piece.id} onClick={() => handleSquareClick(piece.position)} rotate={isFlipped}/>
          ))}
          
          {winner && (
              <div className={`absolute inset-0 bg-black/70 z-50 flex flex-col items-center justify-center text-white ${isFlipped ? 'rotate-180' : ''}`}>
                  <h2 className="text-5xl font-bold mb-8 text-yellow-400">{winner === Side.RED ? "红方胜" : "黑方胜"}</h2>
                  <div className="flex flex-col gap-5 w-64">
                    <button onClick={handleRestart} className="bg-green-600 px-8 py-4 rounded-full font-bold text-xl shadow-xl">再来一局</button>
                    <button onClick={exitRoom} className="bg-white/10 border-2 px-8 py-3 rounded-full font-bold">返回大厅</button>
                  </div>
              </div>
          )}
      </div>

      {/* --- FOOTER CONTROLS --- */}
      <div className="w-full max-w-md px-4 mt-4">
          <div className="flex justify-between items-center mb-3">
             <div className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow border ${myRole === Side.RED ? 'bg-red-50 text-red-800 border-red-200' : myRole === Side.BLACK ? 'bg-stone-800 text-white border-stone-600' : 'bg-yellow-100 text-yellow-800 border-yellow-200'}`}>
                 <span className="opacity-70 text-xs">{myRole === 'SPECTATOR' ? '观战:' : '我:'}</span>
                 <span>{userProfile.name}</span>
             </div>
             
             {myRole !== 'SPECTATOR' && (
                  <button onClick={requestUndo} disabled={!!onlineData?.meta.undo_requester} className={`px-4 py-2 rounded-xl border font-bold ${onlineData?.meta.undo_requester === myRole ? 'bg-orange-200 text-orange-800' : 'bg-white text-orange-600'}`}>
                      {onlineData?.meta.undo_requester === myRole ? "请求中..." : "↺ 悔棋"}
                  </button>
             )}
          </div>
          
          <div className={`text-center text-sm font-bold p-2 rounded-lg mb-3 ${turn === Side.RED ? 'bg-red-100 text-red-800' : 'bg-stone-200 text-stone-800'}`}>
              当前: {turn === Side.RED ? "红方走棋" : "黑方走棋"}
              {myRole === 'SPECTATOR' && onlineData?.meta.helper_id === userProfile.id && <span className="text-green-600 ml-2 animate-pulse font-extrabold">(请您帮这步!)</span>}
          </div>

          <div className="grid grid-cols-2 gap-2">
             {/* AI Helper Button */}
             <div className={`p-2 rounded-xl border text-xs flex justify-between items-center shadow-sm transition-all ${isLiveConnected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-stone-200'}`}>
                <div className="flex flex-col">
                    <span className="font-bold text-stone-700">AI 特级大师</span>
                    <span className={`text-[10px] ${isLiveConnected ? 'text-green-600' : 'text-gray-400'}`}>{liveStatus}</span>
                </div>
                <button onClick={toggleLive} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${isLiveConnected ? 'bg-red-100 text-red-700' : 'bg-blue-600 text-white'}`}>
                    {isLiveConnected ? '断开' : '呼叫'}
                </button>
             </div>

             {/* Video Chat Button */}
             {gameMode === 'online' && (
                 <div className={`p-2 rounded-xl border text-xs flex justify-between items-center shadow-sm transition-all ${isVideoEnabled ? 'bg-green-50 border-green-300 ring-1 ring-green-300' : 'bg-white border-stone-200'}`}>
                    <div className="flex flex-col">
                        <span className="font-bold text-stone-700">家人视频</span>
                        <span className={`text-[10px] ${isVideoEnabled ? 'text-green-600' : 'text-gray-400'}`}>{isVideoEnabled ? "通话中" : "点击开启"}</span>
                    </div>
                    <button onClick={toggleVideoChat} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${isVideoEnabled ? 'bg-red-100 text-red-700' : 'bg-green-600 text-white'}`}>
                        {isVideoEnabled ? '挂断' : '开启'}
                    </button>
                 </div>
             )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {gameMode === 'online' && onlineData && onlineData.players.spectators && onlineData.players.spectators.length > 0 && (
              <div className="w-full bg-stone-100 p-3 rounded-lg border border-stone-200 mt-2">
                  <p className="text-xs text-stone-500 mb-2 font-bold">亲友团 (点击头像请其帮忙):</p>
                  <div className="flex flex-wrap gap-2">
                      {onlineData.players.spectators.map(s => (
                          <button key={s.id} onClick={() => requestHelp(s.id)} disabled={turn !== myRole} className={`px-3 py-1.5 text-xs rounded-full border transition-all font-bold flex items-center gap-1 ${onlineData.meta.helper_id === s.id ? 'bg-green-500 text-white border-green-600 shadow-md' : 'bg-white text-stone-600 border-stone-300'} ${turn !== myRole ? 'opacity-50' : ''}`}>
                              {s.name} {onlineData.meta.helper_id === s.id && <span>✨</span>}
                          </button>
                      ))}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default App;
