import React, { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, X } from 'lucide-react';
import type { SpecGroup, SpecValue } from './types';

// ==============================
// Sortable Spec Value Component
// ==============================
function SortableSpecValue({ value, onRemove }: { value: SpecValue; onRemove: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: value.id,
    });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-background border rounded-md text-sm cursor-grab active:cursor-grabbing group/value hover:border-primary"
        >
            <span>{value.name}</span>
            <button
                type="button"
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover/value:opacity-100"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}

// ==============================
// Sortable Spec Group Component
// ==============================
function SortableSpecGroup({
    group,
    onUpdate,
    onRemove,
    onAddValue,
    onRemoveValue,
    onReorderValues,
}: {
    group: SpecGroup;
    onUpdate: (data: Partial<SpecGroup>) => void;
    onRemove: () => void;
    onAddValue: (name: string) => void;
    onRemoveValue: (valId: string) => void;
    onReorderValues: (oldIndex: number, newIndex: number) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: group.id,
    });
    const style = { transform: CSS.Transform.toString(transform), transition };

    const [newValueName, setNewValueName] = useState('');

    const handleAddValue = () => {
        if (newValueName.trim()) {
            onAddValue(newValueName.trim());
            setNewValueName('');
        }
    };

    // Inner DND setup for values
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEndValues = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = group.values.findIndex((v) => v.id === active.id);
            const newIndex = group.values.findIndex((v) => v.id === over.id);
            onReorderValues(oldIndex, newIndex);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`border rounded-lg p-4 bg-card shadow-sm mb-4 transition-colors ${
                isDragging ? 'opacity-50 border-primary' : ''
            }`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 w-full max-w-sm">
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded text-muted-foreground"
                    >
                        <GripVertical className="h-4 w-4" />
                    </div>
                    <input
                        className="h-8 w-full rounded border border-input bg-transparent px-3 text-sm focus:border-primary focus:outline-none"
                        value={group.name}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                        placeholder="规格名 (如: 颜色)"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer ml-4">
                        <input
                            type="checkbox"
                            checked={group.hasImage}
                            onChange={(e) => onUpdate({ hasImage: e.target.checked })}
                            className="rounded border-input text-primary"
                        />
                        添加规格图
                    </label>
                </div>
                <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive p-1.5 rounded hover:bg-muted"
                    onClick={onRemove}
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <div className="pl-9 pr-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndValues}>
                    <SortableContext
                        items={group.values.map((v) => v.id)}
                        strategy={horizontalListSortingStrategy}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            {group.values.map((v) => (
                                <SortableSpecValue
                                    key={v.id}
                                    value={v}
                                    onRemove={() => onRemoveValue(v.id)}
                                />
                            ))}
                            <div className="flex items-center gap-1 w-32 border border-dashed rounded-md bg-muted/20 focus-within:border-primary">
                                <input
                                    className="h-8 w-full bg-transparent px-2 text-sm focus:outline-none"
                                    placeholder="添加规格值"
                                    value={newValueName}
                                    onChange={(e) => setNewValueName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddValue();
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </SortableContext>
                </DndContext>
                {group.hasImage && group.values.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-dashed flex gap-3 text-xs text-muted-foreground">
                        {/* 这里原本是用于配置每个值的图像，为了精简可先作为提示 */}
                        <div className="flex gap-4">
                            {group.values.map(v => (
                                <div key={v.id} className="flex flex-col items-center gap-2">
                                     <div className="w-10 h-10 border border-dashed hover:border-primary cursor-pointer rounded flex items-center justify-center bg-muted/10">
                                         <Plus className="h-4 w-4 opacity-50"/>
                                     </div>
                                     <span className="truncate max-w-[40px]">{v.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ==============================
// Main Configurator
// ==============================
interface SpecDefinerProps {
    groups: SpecGroup[];
    onAddGroup: (name: string) => void;
    onUpdateGroup: (id: string, data: Partial<SpecGroup>) => void;
    onRemoveGroup: (id: string) => void;
    onAddValue: (groupId: string, name: string) => void;
    onRemoveValue: (groupId: string, valId: string) => void;
    onReorderGroups: (oldIndex: number, newIndex: number) => void;
    onReorderValues: (groupId: string, oldIndex: number, newIndex: number) => void;
}

export function SpecDefiner({
    groups,
    onAddGroup,
    onUpdateGroup,
    onRemoveGroup,
    onAddValue,
    onRemoveValue,
    onReorderGroups,
    onReorderValues,
}: SpecDefinerProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEndGroups = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = groups.findIndex((g) => g.id === active.id);
            const newIndex = groups.findIndex((g) => g.id === over.id);
            onReorderGroups(oldIndex, newIndex);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 mb-4 p-4 border rounded-lg bg-muted/10">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">规格维度</span>
                    <div className="flex items-center gap-2">
                        <select className="h-8 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground">
                            <option value="">选择规格模板</option>
                            <option value="apparel">默认服装尺码</option>
                            <option value="shoes">默认鞋类尺码</option>
                        </select>
                        <button className="h-8 px-3 border rounded text-xs hover:bg-muted text-primary">另存为模板</button>
                    </div>
                </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndGroups}>
                <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                    {groups.map((g) => (
                        <SortableSpecGroup
                            key={g.id}
                            group={g}
                            onUpdate={(data) => onUpdateGroup(g.id, data)}
                            onRemove={() => onRemoveGroup(g.id)}
                            onAddValue={(name) => onAddValue(g.id, name)}
                            onRemoveValue={(valId) => onRemoveValue(g.id, valId)}
                            onReorderValues={(oldIdx, newIdx) => onReorderValues(g.id, oldIdx, newIdx)}
                        />
                    ))}
                </SortableContext>
            </DndContext>

            <button
                type="button"
                className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm"
                onClick={() => onAddGroup('')}
            >
                <Plus className="h-4 w-4" />
                添加新规格分类
            </button>
        </div>
    );
}
