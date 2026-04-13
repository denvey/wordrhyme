import React from 'react';
import { Button } from '@wordrhyme/ui';
import { X } from 'lucide-react';

export interface CustomParameter {
    id: string;
    name: string;
    values: string[];
}

interface ParameterEditorProps {
    parameters: CustomParameter[];
    onChange: (parameters: CustomParameter[]) => void;
}

export function ParameterEditor({ parameters, onChange }: ParameterEditorProps) {
    const handleAddParam = () => {
        onChange([...parameters, { id: crypto.randomUUID(), name: '', values: [] }]);
    };

    const handleRemoveParam = (index: number) => {
        const newParams = [...parameters];
        newParams.splice(index, 1);
        onChange(newParams);
    };

    const handleUpdateName = (index: number, name: string) => {
        const newParams = [...parameters];
        if (!newParams[index]) return;
        newParams[index].name = name;
        onChange(newParams);
    };

    const handleAddValue = (index: number, value: string) => {
        const v = value.trim();
        if (!v) return;
        const newParams = [...parameters];
        if (!newParams[index]) return;
        if (!newParams[index].values.includes(v)) {
            newParams[index].values.push(v);
        }
        onChange(newParams);
    };

    const handleRemoveValue = (paramIndex: number, valueIndex: number) => {
        const newParams = [...parameters];
        if (!newParams[paramIndex]) return;
        newParams[paramIndex].values.splice(valueIndex, 1);
        onChange(newParams);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <Button variant="outline" onClick={handleAddParam} type="button">
                    添加参数
                </Button>
            </div>

            {parameters.length > 0 && (
                <div className="border rounded-md overflow-hidden bg-card">
                    <table className="w-full text-sm table-fixed">
                        <thead className="bg-[#f0f4f8] border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[30%]">参数名称</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[60%]">参数值</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground w-[10%]">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {parameters.map((param, pIdx) => (
                                <tr key={param.id} className="group/row">
                                    <td className="px-4 py-4 align-top">
                                        <input
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            placeholder="请输入参数名称"
                                            value={param.name}
                                            onChange={(e) => handleUpdateName(pIdx, e.currentTarget.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                        <div className="flex flex-wrap gap-2 items-center min-h-[36px] px-2 py-1 border border-input rounded-md focus-within:ring-1 focus-within:ring-ring">
                                            {param.values.map((v, vIdx) => (
                                                <div key={vIdx} className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm border">
                                                    <span>{v}</span>
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded-full ml-1"
                                                        onClick={() => handleRemoveValue(pIdx, vIdx)}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            <input
                                                className="flex-1 min-w-[200px] h-7 border-0 bg-transparent px-1 text-sm focus-visible:outline-none"
                                                placeholder="请输入选项，回车确认"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddValue(pIdx, e.currentTarget.value);
                                                        e.currentTarget.value = '';
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    if (e.currentTarget.value) {
                                                        handleAddValue(pIdx, e.currentTarget.value);
                                                        e.currentTarget.value = '';
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-top text-center">
                                        <Button
                                            variant="ghost"
                                            className="text-primary hover:text-primary/80 hover:bg-primary/10 h-9 px-3"
                                            onClick={() => handleRemoveParam(pIdx)}
                                        >
                                            删除
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
