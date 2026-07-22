import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
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
  const touchStartY = useRef<number>(0);
  const touchCurrentIndex = useRef<number | null>(null);

  React.useEffect(() => {
    if (draggedIndex === null) {
      setLocalItems(items);
    }
  }, [items, draggedIndex]);

  const performReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const newItems = [...localItems];
      const [draggedItem] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, draggedItem);
      setLocalItems(newItems);
      const orderedIds = newItems.map(getItemId);
      onReorder(orderedIds);
    },
    [localItems, getItemId, onReorder]
  );

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
      performReorder(draggedIndex, dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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
        performReorder(sourceIndex, dragOverIndex);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    touchCurrentIndex.current = null;
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* Priority indicator */}
      {hasManualPriority && (
        <div className="flex items-center justify-between p-2.5 rounded-xl glass-card border-primary/20 bg-primary/5">
          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Manual Priority Active
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearPriority}
            className="h-7 text-xs rounded-full"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>
      )}

      {/* Draggable items */}
      <div className="space-y-2.5">
        {localItems.map((item, index) => {
          const id = getItemId(item);
          const isDragging = draggedIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={id}
              data-order-index={index}
              onDragOver={(e) => handleDragOver(e, index)}
              className={cn(
                "relative transition-all duration-200",
                isDragging && "opacity-50 scale-[0.97] shadow-xl z-10",
                isDragOver && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background rounded-2xl"
              )}
            >
              <div className="flex items-start gap-1.5">
                {/* Drag handle */}
                <div
                  role="button"
                  aria-label="Drag handle to reorder this delivery"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleTouchStart(e, index);
                  }}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    "flex-shrink-0 mt-5 p-1.5 cursor-grab active:cursor-grabbing touch-none rounded-lg transition-colors",
                    "hover:bg-primary/10 active:bg-primary/20"
                  )}
                  style={{ touchAction: "none" }}
                >
                  <div className="flex flex-col gap-[3px]">
                    <div className="flex gap-[3px]">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    </div>
                    <div className="flex gap-[3px]">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    </div>
                    <div className="flex gap-[3px]">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    </div>
                  </div>
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
