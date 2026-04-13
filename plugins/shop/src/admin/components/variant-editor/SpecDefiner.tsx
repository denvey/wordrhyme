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
import { GripVertical, Plus, Trash2, X, Save } from 'lucide-react';
import type { SpecGroup, SpecValue } from './types';
import { SmartImage } from '../ImageGallery';
import { Button } from '@wordrhyme/ui';

// ==============================
// Sortable Spec Value Component
// ==============================
function SortableSpecValue({
    value,
    onUpdateName,
    onRemove,
    hasImage,
    onUpdateImage
}: {
    value: SpecValue;
    onUpdateName: (name: string) => void;
    onRemove: () => void;
    hasImage?: boolean;
    onUpdateImage?: (image: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: value.id,
    });
    // 关键：必须使用 Translate 而非 Transform，否则 dnd-kit 会自动拉伸补齐宽口差，导致胶囊变形
    const style = { transform: CSS.Translate.toString(transform), transition };

    const openMediaPicker = () => {
        if (!onUpdateImage) return;
        const picker = (window as any).__OMNIDS_MEDIA_PICKER__;
        if (picker) {
            picker.open({
                presentation: 'dialog',
                mode: 'single',
                onSelect: (media: any[]) => {
                    if (media.length > 0) {
                        onUpdateImage(media[0].id || media[0].url || '');
                    }
                },
            });
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex flex-col items-center"
        >
            <div
                {...attributes}
                {...listeners}
                className="relative px-2 py-1.5 bg-background border rounded-md text-sm cursor-grab active:cursor-grabbing group/value hover:border-primary min-w-[72px] inline-flex items-center justify-center z-20"
            >
                <div className="inline-grid items-center justify-center [grid-template-areas:'main']">
                    {/* 隐藏的 span 撑开宽度，从而实现 input 的自适应宽度 */}
                    <span className="[grid-area:main] invisible whitespace-pre font-medium px-1" aria-hidden="true">
                        {value.name || ' '}
                    </span>
                    <input
                        size={1}
                        className="[grid-area:main] w-full min-w-0 bg-transparent text-center focus:outline-none pointer-events-auto px-1"
                        value={value.name}
                        onChange={(e) => onUpdateName((e.target as HTMLInputElement).value)}
                        onPointerDown={(e) => e.stopPropagation()} // 防止点击输入框触发拖拽
                        onKeyDown={(e) => {
                            e.stopPropagation(); // 关键：防止回车/空格等冒泡触发 dnd-kit 的 KeyboardSensor 导致元素被“提起”并悬停
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                    />
                </div>
                <button
                    type="button"
                    className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center opacity-0 group-hover/value:opacity-100 group-hover/value:hover:bg-destructive group-hover/value:hover:text-destructive-foreground transition-all shadow-sm z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                >
                    <X className="h-2.5 w-2.5" />
                </button>
            </div>

            {hasImage && (
                <div
                    className="mt-3 cursor-pointer group/img relative w-[72px]"
                    onClick={(e) => {
                        e.stopPropagation();
                        openMediaPicker();
                    }}
                >
                    {/* 经典旋转 45 度的方块伪装成向上三角：使用不透明的 bg-background 彻底盖住底下的边框线 */}
                    <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-background border-l border-t border-border rounded-tl-[1px] rotate-45 z-10 group-hover/img:border-primary transition-colors pointer-events-none"></div>

                    <div className="relative w-full aspect-square border border-border rounded-md flex items-center justify-center bg-background group-hover/img:border-primary transition-colors overflow-hidden">
                        {value.image ? (
                            <>
                                <SmartImage
                                    src={value.image}
                                    alt={value.name}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white text-xs">替换</span>
                                </div>
                            </>
                        ) : (
                            <Plus className="h-5 w-5 text-muted-foreground group-hover/img:text-primary transition-colors" />
                        )}
                    </div>
                </div>
            )}
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
    onUpdateValue,
}: {
    group: SpecGroup;
    onUpdate: (data: Partial<SpecGroup>) => void;
    onRemove: () => void;
    onAddValue: (name: string) => void;
    onRemoveValue: (valId: string) => void;
    onReorderValues: (oldIndex: number, newIndex: number) => void;
    onUpdateValue: (valId: string, data: Partial<SpecValue>) => void;
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

    // Image logic removed from here as it handles via unified element now

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
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{group.values.length}/30</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer ml-2">
                        <input
                            type="checkbox"
                            checked={group.hasImage}
                            onChange={(e) => onUpdate({ hasImage: e.target.checked })}
                            className="rounded border-input text-primary accent-primary h-3.5 w-3.5"
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
                        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
                            {group.values.map((v) => (
                                <SortableSpecValue
                                    key={v.id}
                                    value={v}
                                    onUpdateName={(name) => onUpdateValue(v.id, { name })}
                                    onRemove={() => onRemoveValue(v.id)}
                                    hasImage={group.hasImage}
                                    onUpdateImage={(image) => onUpdateValue(v.id, { image })}
                                />
                            ))}
                            <div className="inline-flex items-center justify-center min-w-[72px] border border-dashed rounded-md bg-muted/20 focus-within:border-primary self-start px-3 h-[34px]">
                                <div className="inline-grid items-center justify-center [grid-template-areas:'main']">
                                    <span className="[grid-area:main] invisible whitespace-pre text-sm font-medium px-1" aria-hidden="true">
                                        {newValueName || '添加规格值'}
                                    </span>
                                    <input
                                        size={1}
                                        className="[grid-area:main] w-full min-w-0 bg-transparent text-center text-sm focus:outline-none px-1"
                                        placeholder="添加规格值"
                                        value={newValueName}
                                        onChange={(e) => setNewValueName(e.target.value)}
                                        onKeyDown={(e) => {
                                            // 如果当前处于中文等输入法的拼写状态，按回车仅确认拼音，不要触发添加逻辑
                                            if ((e.nativeEvent as any).isComposing) return;

                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddValue();
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </SortableContext>
                </DndContext>
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
    onUpdateValue: (groupId: string, valueId: string, data: Partial<SpecValue>) => void;
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
    onUpdateValue,
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
                            onUpdateValue={(valId, data) => onUpdateValue(g.id, valId, data)}
                        />
                    ))}
                </SortableContext>
            </DndContext>

            <div className="flex items-center gap-2 mt-2 pb-2 pl-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => onAddGroup('')}
                >
                    <Plus className="h-4 w-4" />
                    添加新规格
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                >
                    <Save className="h-4 w-4" />
                    另存为模板
                </Button>
            </div>
        </div>
    );
}
