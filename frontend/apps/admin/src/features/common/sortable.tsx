"use client";
import * as React from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type Handle = React.HTMLAttributes<HTMLButtonElement>;

function Row<T extends { id: string }>({ item, render }: { item: T; render: (item: T, handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const handle = (
    <button type="button" className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing" aria-label="Drag to reorder" {...(attributes as Handle)} {...(listeners as Handle)}>
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.85 : 1 }}>
      {render(item, handle)}
    </div>
  );
}

/** Vertical drag & drop list. `onReorder` receives the new id order. */
export function SortableList<T extends { id: string }>({ items, onReorder, render, className }: { items: T[]; onReorder: (ids: string[]) => void; render: (item: T, handle: React.ReactNode) => React.ReactNode; className?: string }) {
  const [order, setOrder] = React.useState(items);
  React.useEffect(() => {
    setOrder(items);
  }, [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((i) => i.id === e.active.id);
    const to = order.findIndex((i) => i.id === e.over!.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    onReorder(next.map((i) => i.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>{order.map((item) => <Row key={item.id} item={item} render={render} />)}</div>
      </SortableContext>
    </DndContext>
  );
}
