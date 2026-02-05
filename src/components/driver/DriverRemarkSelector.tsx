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
import { cn } from "@/lib/utils";

const REMARK_BORDER_COLORS: Record<string, string> = {
  texted_customer: "border-l-[hsl(217,91%,60%)]",
  called_customer: "border-l-[hsl(271,91%,65%)]",
  waiting_reply: "border-l-[hsl(var(--status-neutral))]",
  customer_replied: "border-l-[hsl(var(--status-success))]",
  arranging_delivery: "border-l-[hsl(var(--status-warning))]",
  custom: "border-l-[hsl(45,93%,47%)]",
};

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

  useEffect(() => {
    setSelectedType(currentRemark?.remark_type || "");
    setCustomText(currentRemark?.remark_text || "");
  }, [currentRemark]);

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    if (value !== "custom") {
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

  const borderColor = currentRemark?.remark_type
    ? REMARK_BORDER_COLORS[currentRemark.remark_type] || ""
    : "";

  // Show current remark summary when not editing
  if (currentRemark && !isEditing && selectedType !== "custom") {
    return (
      <div className={cn(
        "rounded-xl bg-secondary/30 border border-border/30 overflow-hidden",
      )}>
        <div className={cn("p-3 border-l-[3px]", borderColor)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">
                {getRemarkLabel(currentRemark.remark_type)}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => setIsEditing(true)}
              >
                <MessageSquare className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full text-[hsl(var(--status-error))]"
                onClick={handleClear}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {currentRemark.remark_text && (
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
              {currentRemark.remark_text}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-secondary/30 border border-border/30 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Driver Note</span>
      </div>

      <Select value={selectedType} onValueChange={handleTypeChange}>
        <SelectTrigger className="h-9 text-sm rounded-xl">
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
            className="min-h-[80px] text-sm resize-none rounded-xl"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSaveCustom}
              disabled={!customText.trim()}
              className="flex-1 rounded-full h-8 text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full h-8 text-xs"
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
          className="w-full text-[hsl(var(--status-error))] text-xs rounded-full h-8"
          onClick={handleClear}
        >
          <X className="h-3 w-3 mr-1" />
          Clear Note
        </Button>
      )}
    </div>
  );
};

export default DriverRemarkSelector;
