
"use client";

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  count?: number;
  value?: number; // Current rating value
  onValueChange?: (rating: number) => void; // For input
  size?: number;
  color?: string;
  hoverColor?: string;
  inactiveColor?: string;
  className?: string;
  isEditable?: boolean;
}

export const StarRating: React.FC<StarRatingProps> = ({
  count = 5,
  value = 0,
  onValueChange,
  size = 24,
  color = "hsl(var(--primary))", // Use theme primary
  hoverColor = "hsl(var(--accent))", // Use theme accent
  inactiveColor = "hsl(var(--muted-foreground))",
  className,
  isEditable = true,
}) => {
  const [hoverValue, setHoverValue] = useState<number | undefined>(undefined);

  const stars = Array(count).fill(0);

  const handleClick = (newValue: number) => {
    if (isEditable && onValueChange) {
      onValueChange(newValue);
    }
  };

  const handleMouseOver = (newHoverValue: number) => {
    if (isEditable) {
      setHoverValue(newHoverValue);
    }
  };

  const handleMouseLeave = () => {
    if (isEditable) {
      setHoverValue(undefined);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {stars.map((_, index) => {
        const starValue = index + 1;
        let starFill = inactiveColor;

        if (hoverValue !== undefined) {
          starFill = starValue <= hoverValue ? hoverColor : inactiveColor;
        } else {
          starFill = starValue <= value ? color : inactiveColor;
        }

        return (
          <Star
            key={index}
            size={size}
            fill={starFill}
            stroke={starFill === inactiveColor ? inactiveColor : "none"} // Ensure border matches fill or is none
            className={cn(
              isEditable ? 'cursor-pointer' : 'cursor-default',
              "transition-colors"
            )}
            onClick={() => handleClick(starValue)}
            onMouseOver={() => handleMouseOver(starValue)}
            onMouseLeave={handleMouseLeave}
          />
        );
      })}
    </div>
  );
};
