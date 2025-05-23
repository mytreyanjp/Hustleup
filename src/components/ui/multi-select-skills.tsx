// src/components/ui/multi-select-skills.tsx
"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"; // Corrected: This should now exist
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"; // Corrected: This should now exist
import { Badge } from "@/components/ui/badge";
import type { Skill } from "@/lib/constants";

interface MultiSelectSkillsProps {
  options: readonly Skill[];
  selected: Skill[];
  onChange: (selected: Skill[]) => void;
  className?: string;
  placeholder?: string;
  maxSkills?: number;
}

export function MultiSelectSkills({
  options,
  selected,
  onChange,
  className,
  placeholder = "Select skills...",
  maxSkills,
}: MultiSelectSkillsProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");

  const handleSelect = (skill: Skill) => {
    if (maxSkills && selected.length >= maxSkills && !selected.includes(skill)) {
      // TODO: Optionally show a toast or message about max skills reached
      console.warn(`Maximum ${maxSkills} skills allowed.`);
      return;
    }
    onChange(
      selected.includes(skill)
        ? selected.filter((s) => s !== skill)
        : [...selected, skill]
    );
  };

  const handleRemove = (skill: Skill) => {
    onChange(selected.filter((s) => s !== skill));
  };

  const filteredOptions = options.filter(option => 
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between h-auto min-h-10", selected.length > 0 ? "py-2" : "")}
          >
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selected.map((skill) => (
                  <Badge
                    variant="secondary"
                    key={skill}
                    className="mr-1 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault(); // Prevent button click
                      e.stopPropagation(); // Prevent popover from closing
                      handleRemove(skill);
                    }}
                  >
                    {skill}
                    <X className="ml-1.5 h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput 
              placeholder="Search skills..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>No skill found.</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={(currentValue) => {
                      // currentValue is the string representation of the skill
                      // We need to find the original Skill type from options
                      const skillValue = options.find(opt => opt.toLowerCase() === currentValue.toLowerCase());
                      if (skillValue) {
                        handleSelect(skillValue);
                      }
                      setSearchTerm(""); // Reset search term after selection
                      // Keep popover open for multi-select
                      // setOpen(false); 
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected.includes(option) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {maxSkills && (
        <p className="text-xs text-muted-foreground mt-1">
          Selected {selected.length} of {maxSkills} skills.
        </p>
      )}
    </div>
  );
}
