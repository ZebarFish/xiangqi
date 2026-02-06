
import React from 'react';
import { Piece, Side } from '../types';
import { PIECE_LABELS } from '../constants';

interface BoardPieceProps {
  piece: Piece;
  isSelected: boolean;
  onClick: () => void;
  rotate?: boolean; // New prop to handle board rotation
}

export const BoardPiece: React.FC<BoardPieceProps> = ({ piece, isSelected, onClick, rotate = false }) => {
  const isRed = piece.side === Side.RED;
  
  // Dynamic positioning based on 0-8 x 0-9 grid
  const style: React.CSSProperties = {
    left: `${piece.position.x * 11.11}%`,
    top: `${piece.position.y * 10}%`,
    width: '11.11%',
    height: '10%',
  };

  const labelKey = `${piece.side}_${piece.type}`;
  const label = PIECE_LABELS[labelKey] || '?';

  return (
    <div 
      className={`absolute flex justify-center items-center cursor-pointer transition-all duration-300 z-10 p-0.5 sm:p-1`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className={`
        w-full aspect-square rounded-full border-2 
        flex items-center justify-center shadow-md select-none transition-transform duration-300
        ${isSelected 
            ? 'ring-[3px] ring-blue-500 ring-offset-2 scale-110 z-20 shadow-xl' 
            : 'hover:scale-105'
        }
        ${isRed ? 'bg-[#f0d9b5] border-red-700 text-red-700' : 'bg-[#f0d9b5] border-black text-black'}
        /* If board is rotated 180, we rotate the piece 180 back so text is upright */
        ${rotate ? 'rotate-180' : ''}
      `}>
        {/* Selected Pulse Effect Overlay */}
        {isSelected && (
          <div className="absolute inset-0 rounded-full border-4 border-blue-400 opacity-60 animate-ping"></div>
        )}

        <div className={`
          w-[85%] h-[85%] rounded-full border border-dashed border-opacity-40
          ${isRed ? 'border-red-700' : 'border-black'}
          flex items-center justify-center relative
        `}>
          <span className="text-xl sm:text-2xl md:text-3xl font-bold font-serif leading-none select-none">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};
