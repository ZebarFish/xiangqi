import { Piece, PieceType, Side } from './types';

export const BOARD_ROWS = 10;
export const BOARD_COLS = 9;

// Initial Setup
const createPiece = (id: string, type: PieceType, side: Side, x: number, y: number): Piece => ({
  id,
  type,
  side,
  position: { x, y }
});

export const INITIAL_PIECES: Piece[] = [
  // RED (Bottom, y=9 to 5)
  createPiece('r_rook_1', PieceType.CHARIOT, Side.RED, 0, 9),
  createPiece('r_horse_1', PieceType.HORSE, Side.RED, 1, 9),
  createPiece('r_elephant_1', PieceType.ELEPHANT, Side.RED, 2, 9),
  createPiece('r_advisor_1', PieceType.ADVISOR, Side.RED, 3, 9),
  createPiece('r_general', PieceType.GENERAL, Side.RED, 4, 9),
  createPiece('r_advisor_2', PieceType.ADVISOR, Side.RED, 5, 9),
  createPiece('r_elephant_2', PieceType.ELEPHANT, Side.RED, 6, 9),
  createPiece('r_horse_2', PieceType.HORSE, Side.RED, 7, 9),
  createPiece('r_rook_2', PieceType.CHARIOT, Side.RED, 8, 9),
  createPiece('r_cannon_1', PieceType.CANNON, Side.RED, 1, 7),
  createPiece('r_cannon_2', PieceType.CANNON, Side.RED, 7, 7),
  createPiece('r_pawn_1', PieceType.SOLDIER, Side.RED, 0, 6),
  createPiece('r_pawn_2', PieceType.SOLDIER, Side.RED, 2, 6),
  createPiece('r_pawn_3', PieceType.SOLDIER, Side.RED, 4, 6),
  createPiece('r_pawn_4', PieceType.SOLDIER, Side.RED, 6, 6),
  createPiece('r_pawn_5', PieceType.SOLDIER, Side.RED, 8, 6),

  // BLACK (Top, y=0 to 4)
  createPiece('b_rook_1', PieceType.CHARIOT, Side.BLACK, 0, 0),
  createPiece('b_horse_1', PieceType.HORSE, Side.BLACK, 1, 0),
  createPiece('b_elephant_1', PieceType.ELEPHANT, Side.BLACK, 2, 0),
  createPiece('b_advisor_1', PieceType.ADVISOR, Side.BLACK, 3, 0),
  createPiece('b_general', PieceType.GENERAL, Side.BLACK, 4, 0),
  createPiece('b_advisor_2', PieceType.ADVISOR, Side.BLACK, 5, 0),
  createPiece('b_elephant_2', PieceType.ELEPHANT, Side.BLACK, 6, 0),
  createPiece('b_horse_2', PieceType.HORSE, Side.BLACK, 7, 0),
  createPiece('b_rook_2', PieceType.CHARIOT, Side.BLACK, 8, 0),
  createPiece('b_cannon_1', PieceType.CANNON, Side.BLACK, 1, 2),
  createPiece('b_cannon_2', PieceType.CANNON, Side.BLACK, 7, 2),
  createPiece('b_pawn_1', PieceType.SOLDIER, Side.BLACK, 0, 3),
  createPiece('b_pawn_2', PieceType.SOLDIER, Side.BLACK, 2, 3),
  createPiece('b_pawn_3', PieceType.SOLDIER, Side.BLACK, 4, 3),
  createPiece('b_pawn_4', PieceType.SOLDIER, Side.BLACK, 6, 3),
  createPiece('b_pawn_5', PieceType.SOLDIER, Side.BLACK, 8, 3),
];

export const PIECE_LABELS: Record<string, string> = {
  [`${Side.RED}_${PieceType.GENERAL}`]: '帅',
  [`${Side.RED}_${PieceType.ADVISOR}`]: '仕',
  [`${Side.RED}_${PieceType.ELEPHANT}`]: '相',
  [`${Side.RED}_${PieceType.HORSE}`]: '马',
  [`${Side.RED}_${PieceType.CHARIOT}`]: '车',
  [`${Side.RED}_${PieceType.CANNON}`]: '炮',
  [`${Side.RED}_${PieceType.SOLDIER}`]: '兵',
  [`${Side.BLACK}_${PieceType.GENERAL}`]: '将',
  [`${Side.BLACK}_${PieceType.ADVISOR}`]: '士',
  [`${Side.BLACK}_${PieceType.ELEPHANT}`]: '象',
  [`${Side.BLACK}_${PieceType.HORSE}`]: '马',
  [`${Side.BLACK}_${PieceType.CHARIOT}`]: '车',
  [`${Side.BLACK}_${PieceType.CANNON}`]: '炮',
  [`${Side.BLACK}_${PieceType.SOLDIER}`]: '卒',
};
