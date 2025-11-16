import React, { useState, useRef } from 'react';

interface EmpathyMeterProps {
  averageRating: number; // A percentage from 0-100
  ratingCount: number;
  userRating: number | null; // A percentage from 0-100
  onRate: (rating: number) => void; // Expects a percentage from 0-100
  disabled: boolean;
}

const getEmojiForValue = (value: number): { emoji: string; label: string; color: string } => {
  const roundedValue = Math.round(value);
  if (value < 1 && roundedValue === 0) return { emoji: '🤔', label: 'Rate this story', color: '#64748b' };
  if (roundedValue <= 20) return { emoji: '😠', label: 'Terrible', color: '#ef4444' };
  if (roundedValue <= 40) return { emoji: '😟', label: 'Bad', color: '#f97316' };
  if (roundedValue <= 60) return { emoji: '😐', label: 'Okay', color: '#eab308' };
  if (roundedValue <= 80) return { emoji: '😄', label: 'Good', color: '#3b82f6' };
  return { emoji: '😍', label: 'Great', color: '#22c55e' };
};

const EmpathyMeter: React.FC<EmpathyMeterProps> = ({ userRating, onRate, disabled, averageRating, ratingCount }) => {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const displayValue = hoverValue ?? userRating ?? averageRating ?? 0;
  const { emoji, label, color } = getEmojiForValue(displayValue);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setHoverValue(percentage);
  };

  const handleMouseLeave = () => {
    setHoverValue(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !barRef.current) return;
    
    // Recalculate percentage on click to ensure accuracy
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;

    onRate(Math.round(percentage));
  };

  const showLabel = userRating !== null || (averageRating > 0 && ratingCount > 0) || hoverValue !== null;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-lg border dark:border-slate-700 space-y-4">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 text-center">How did this story make you feel?</h3>
      
      <div className="flex items-center gap-4">
        <div
          ref={barRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          className={`relative flex-grow h-6 bg-slate-200 dark:bg-slate-700 rounded-full group ${!disabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayValue)}
          aria-label="Empathy rating"
        >
          {/* Bar Fill */}
          <div 
            className="h-full rounded-full transition-all duration-150 ease-out"
            style={{
              width: `${displayValue}%`,
              background: 'linear-gradient(to right, #ef4444, #f97316, #eab308, #3b82f6, #22c55e)'
            }}
          />
          
          {/* Persistent Percentage Label */}
          {showLabel && (
             <div 
              className="absolute top-0 h-full flex items-center transition-all duration-150 ease-out pointer-events-none"
              style={{ left: `${displayValue}%` }}
            >
              <div
                className="absolute bottom-full mb-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md transform -translate-x-1/2"
              >
                {Math.round(displayValue)}%
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800"></div>
              </div>
            </div>
          )}
        </div>

        {/* Emoji */}
        <div className="text-4xl w-12 h-12 flex items-center justify-center transition-transform duration-200" style={{ transform: hoverValue !== null ? 'scale(1.25)' : 'scale(1)' }}>
          <span role="img" aria-label={label}>{emoji}</span>
        </div>
      </div>
      
      <div className="text-center text-slate-600 dark:text-slate-400 min-h-[24px]">
        {hoverValue !== null && !disabled ? (
          <p className="font-semibold text-lg animate-fade-in" style={{ color }}>{label}</p>
        ) : userRating !== null ? (
          <p>Your rating: <span className="font-semibold" style={{ color: getEmojiForValue(userRating).color }}>{getEmojiForValue(userRating).label}</span></p>
        ) : ratingCount > 0 ? (
          <p>Community average from {ratingCount} vote{ratingCount !== 1 ? 's' : ''}</p>
        ) : (
          <p>Be the first to rate!</p>
        )}
      </div>
    </div>
  );
};

export default EmpathyMeter;