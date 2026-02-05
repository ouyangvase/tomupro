import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Check } from "lucide-react";
import { REMARK_PRESETS, RemarkPreset, DriverRemark } from "@/hooks/useDriverRemarks";

interface DriverRemarkSelectorProps {
  orderId: string;
  currentRemark?: DriverRemark;
  onSave: (orderId: string, remarkType: string, remarkText?: string) => void;
  onDelete: (orderId: string) => void;
}

export const DriverRemarkSelector: React.FC<DriverRemarkSelectorProps> = ({
  orderId,
  currentRemark,
  onSave,
  onDelete,
}) => {
  const [selectedType, setSelectedType] = useState<string>(
    currentRemark?.remark_type || ""
  );
  const [customText, setCustomText] = useState(currentRemark?.remark_text || "");
  const [isEditing, setIsEditing] = useState(false);

  // Update state when current remark changes
  useEffect(() => {
    setSelectedType(currentRemark?.remark_type || "");
    setCustomText(currentRemark?.remark_text || "");
  }, [currentRemark]);

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    if (value !== "custom") {
      // Auto-save for preset options
      onSave(orderId, value);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  };

  const handleSaveCustom = () => {
    if (customText.trim()) {
      onSave(orderId, "custom", customText.trim());
      setIsEditing(false);
    }
  };

  const handleClear = () => {
    onDelete(orderId);
    setSelectedType("");
    setCustomText("");
    setIsEditing(false);
  };

  const getRemarkLabel = (type: string): string => {
    const preset = REMARK_PRESETS.find((p) => p.value === type);
    return preset?.label || type;
  };

  // Show current remark summary when not editing
  if (currentRemark && !isEditing && selectedType !== "custom") {
    return (
      <div className="mt-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {getRemarkLabel(currentRemark.remark_type)}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsEditing(true)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={handleClear}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {currentRemark.remark_text && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {currentRemark.remark_text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Driver Note</span>
      </div>

      <Select value={selectedType} onValueChange={handleTypeChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Add a note..." />
        </SelectTrigger>
        <SelectContent>
          {REMARK_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(selectedType === "custom" || isEditing) && (
        <div className="space-y-2">
          <Textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Enter your note..."
            className="min-h-[80px] text-sm resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSaveCustom}
              disabled={!customText.trim()}
              className="flex-1"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setSelectedType(currentRemark?.remark_type || "");
                setCustomText(currentRemark?.remark_text || "");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {currentRemark && !isEditing && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive"
          onClick={handleClear}
        >
          <X className="h-3.5 w-3.5 mr-1.5" />
          Clear Note
        </Button>
      )}
    </div>
  );
};

export default DriverRemarkSelector;
