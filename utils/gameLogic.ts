
import { Piece, PieceType, Position, Side, Move } from '../types';
import { INITIAL_PIECES } from '../constants';

// Helper to get piece at a specific board position
export const getPieceAt = (pieces: Piece[], pos: Position): Piece | undefined => {
  return pieces.find(p => !p.dead && p.position.x === pos.x && p.position.y === pos.y);
};

// Reconstruct board state from initial state + history
// This is crucial for "Undo" functionality to guarantee state consistency
export const reconstructBoard = (history: Move[]): Piece[] => {
  // Deep copy initial pieces to avoid mutation issues
  let currentPieces: Piece[] = JSON.parse(JSON.stringify(INITIAL_PIECES));

  for (const move of history) {
    const { from, to, capturedId } = move;
    
    // Find moving piece
    const movingPieceIndex = currentPieces.findIndex(p => !p.dead && p.position.x === from.x && p.position.y === from.y);
    
    if (movingPieceIndex !== -1) {
       // Update position
       currentPieces[movingPieceIndex].position = { x: to.x, y: to.y };
       
       // Handle capture
       if (capturedId) {
         const capturedPieceIndex = currentPieces.findIndex(p => p.id === capturedId);
         if (capturedPieceIndex !== -1) {
           currentPieces[capturedPieceIndex].dead = true;
           currentPieces[capturedPieceIndex].position = { x: -1, y: -1 };
         }
       }
    }
  }
  return currentPieces;
};

// Check if a move is within board bounds
const isWithinBounds = (pos: Position): boolean => {
  return pos.x >= 0 && pos.x <= 8 && pos.y >= 0 && pos.y <= 9;
};

// Main Move Validation
export const isValidMove = (
  piece: Piece,
  to: Position,
  pieces: Piece[]
): boolean => {
  if (!isWithinBounds(to)) return false;

  // Cannot capture own pieces
  const target = getPieceAt(pieces, to);
  if (target && target.side === piece.side) return false;

  const dx = to.x - piece.position.x;
  const dy = to.y - piece.position.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Common checks
  if (absDx === 0 && absDy === 0) return false;

  switch (piece.type) {
    case PieceType.GENERAL: // Moves 1 step orthogonal, confined to palace
      if (absDx + absDy !== 1) return false;
      if (piece.side === Side.RED) {
         if (to.y < 7 || to.x < 3 || to.x > 5) return false;
      } else {
         if (to.y > 2 || to.x < 3 || to.x > 5) return false;
      }
      return true;

    case PieceType.ADVISOR: // Diagonal, confined to palace
      if (absDx !== 1 || absDy !== 1) return false;
      if (piece.side === Side.RED) {
        if (to.y < 7 || to.x < 3 || to.x > 5) return false;
      } else {
        if (to.y > 2 || to.x < 3 || to.x > 5) return false;
      }
      return true;

    case PieceType.ELEPHANT: // Diagonal 2 steps, cannot cross river, blocking eye
      if (absDx !== 2 || absDy !== 2) return false;
      // River check
      if (piece.side === Side.RED && to.y < 5) return false;
      if (piece.side === Side.BLACK && to.y > 4) return false;
      // Eye check (blocking)
      const eyePos = { x: piece.position.x + dx / 2, y: piece.position.y + dy / 2 };
      if (getPieceAt(pieces, eyePos)) return false;
      return true;

    case PieceType.HORSE: // Sun move (1 straight, 1 diagonal), blocking leg
      if (!((absDx === 1 && absDy === 2) || (absDx === 2 && absDy === 1))) return false;
      // Hobbling leg check
      const legPos = absDx === 2 
        ? { x: piece.position.x + Math.sign(dx), y: piece.position.y }
        : { x: piece.position.x, y: piece.position.y + Math.sign(dy) };
      if (getPieceAt(pieces, legPos)) return false;
      return true;

    case PieceType.CHARIOT: // Straight lines, no jumping
      if (absDx !== 0 && absDy !== 0) return false;
      return checkLinearPath(piece.position, to, pieces) === 0;

    case PieceType.CANNON: // Straight lines, jump to capture
      if (absDx !== 0 && absDy !== 0) return false;
      const obstacles = checkLinearPath(piece.position, to, pieces);
      if (target) {
        // Capturing requires exactly 1 screen/piece in between
        return obstacles === 1;
      } else {
        // Moving requires 0 obstacles
        return obstacles === 0;
      }

    case PieceType.SOLDIER: // 1 step forward, side after river
      if (piece.side === Side.RED) {
        if (dy > 0) return false; // Cannot move back
        if (to.y > 4) { // Before river
          return dx === 0 && dy === -1;
        } else { // After river
          return (absDx === 1 && dy === 0) || (dx === 0 && dy === -1);
        }
      } else {
        if (dy < 0) return false; // Cannot move back
        if (to.y < 5) { // Before river
          return dx === 0 && dy === 1;
        } else { // After river
          return (absDx === 1 && dy === 0) || (dx === 0 && dy === 1);
        }
      }
  }
  return false;
};

// Count pieces between two points (exclusive of start and end)
const checkLinearPath = (from: Position, to: Position, pieces: Piece[]): number => {
  let count = 0;
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let curX = from.x + dx;
  let curY = from.y + dy;

  while (curX !== to.x || curY !== to.y) {
    if (getPieceAt(pieces, { x: curX, y: curY })) {
      count++;
    }
    curX += dx;
    curY += dy;
  }
  return count;
};
