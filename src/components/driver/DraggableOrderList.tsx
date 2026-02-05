import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { GripVertical, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DraggableOrderListProps<T> {
  items: T[];
  getItemId: (item: T) => string;
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
  hasManualPriority: boolean;
  onClearPriority: () => void;
  className?: string;
}

export function DraggableOrderList<T>({
  items,
  getItemId,
  renderItem,
  onReorder,
  hasManualPriority,
  onClearPriority,
  className,
}: DraggableOrderListProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [localItems, setLocalItems] = useState(items);
  const [hasChanges, setHasChanges] = useState(false);
  const touchStartY = useRef<number>(0);
  const touchCurrentIndex = useRef<number | null>(null);

  // Update local items when props change
  React.useEffect(() => {
    setLocalItems(items);
    setHasChanges(false);
  }, [items]);

  // Desktop drag handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newItems = [...localItems];
      const [draggedItem] = newItems.splice(draggedIndex, 1);
      newItems.splice(dragOverIndex, 0, draggedItem);
      setLocalItems(newItems);
      setHasChanges(true);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Mobile touch handlers
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentIndex.current = index;
    setDraggedIndex(index);
  };

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchCurrentIndex.current === null) return;

      const touch = e.touches[0];
      const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
      const orderCard = elements.find((el) => el.hasAttribute("data-order-index"));

      if (orderCard) {
        const newIndex = parseInt(orderCard.getAttribute("data-order-index") || "0", 10);
        if (newIndex !== dragOverIndex) {
          setDragOverIndex(newIndex);
        }
      }
    },
    [dragOverIndex]
  );

  const handleTouchEnd = () => {
    if (touchCurrentIndex.current !== null && dragOverIndex !== null) {
      const sourceIndex = touchCurrentIndex.current;
      if (sourceIndex !== dragOverIndex) {
        const newItems = [...localItems];
        const [draggedItem] = newItems.splice(sourceIndex, 1);
        newItems.splice(dragOverIndex, 0, draggedItem);
        setLocalItems(newItems);
        setHasChanges(true);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    touchCurrentIndex.current = null;
  };

  const handleSave = () => {
    const orderedIds = localItems.map(getItemId);
    onReorder(orderedIds);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalItems(items);
    setHasChanges(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Priority indicator and controls */}
      {(hasManualPriority || hasChanges) && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-xs font-medium text-primary">
            {hasChanges ? "Unsaved changes" : "Manual Priority Active"}
          </span>
          <div className="flex gap-2">
            {hasChanges && (
              <>
                <Button size="sm" variant="ghost" onClick={handleReset} className="h-7 text-xs">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                <Button size="sm" onClick={handleSave} className="h-7 text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Save Order
                </Button>
              </>
            )}
            {!hasChanges && hasManualPriority && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClearPriority}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to Default
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Draggable items */}
      <div className="space-y-2">
        {localItems.map((item, index) => {
          const id = getItemId(item);
          const isDragging = draggedIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={id}
              data-order-index={index}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, index)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={cn(
                "relative transition-all duration-150",
                isDragging && "opacity-50 scale-[0.98]",
                isDragOver && "ring-2 ring-primary ring-offset-2"
              )}
            >
              <div className="flex items-start gap-2">
                {/* Drag handle */}
                <div
                  className="flex-shrink-0 mt-4 p-2 cursor-grab active:cursor-grabbing touch-none"
                  style={{ touchAction: "none" }}
                >
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                </div>

                {/* Order content */}
                <div className="flex-1 min-w-0">{renderItem(item, index, isDragging)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DraggableOrderList;
