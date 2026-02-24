/**
 * CASL 条件预设定义
 *
 * 设计原则：
 * 1. 预设覆盖 80% 常见场景，减少自定义 JSON 需求
 * 2. 使用 ${user.xxx} 模板语法，运行时自动插值
 * 3. 所有预设都是组织内有效（多租户隔离）
 * 4. 可组合使用（使用 $and 逻辑连接）
 *
 * @priority P0 - 权限系统核心
 */

/**
 * 预设键类型
 */
export type ConditionPresetKey =
  | 'none'          // 无限制
  | 'own'           // 仅自己创建的
  | 'team'          // 同团队的
  | 'department'    // 同部门的
  | 'public'        // 公开的
  | 'draft'         // 草稿状态
  | 'published'     // 已发布
  | 'assigned'      // 分配给自己的
  | 'not_archived'; // 未归档的

/**
 * 条件预设接口
 */
export interface ConditionPreset {
  /** 预设键 */
  key: ConditionPresetKey;
  /** 显示名称 */
  label: string;
  /** 描述说明 */
  description: string;
  /** 适用的资源类型（空则全局适用） */
  applicableSubjects?: string[];
  /** CASL conditions 模板 */
  conditions: Record<string, unknown> | null;
  /** 图标名称（Lucide Icons） */
  icon: string;
  /** 是否可以与其他预设组合使用 */
  combinable: boolean;
}

/**
 * 条件预设定义
 *
 * 注意：
 * - conditions 中的 ${user.xxx} 模板会在运行时替换为实际值
 * - conditions 为 null 表示无条件限制
 */
export const CONDITION_PRESETS: Record<ConditionPresetKey, ConditionPreset> = {
  none: {
    key: 'none',
    label: '无限制',
    description: '可以操作所有数据，无条件限制',
    conditions: null,
    icon: 'Unlock',
    combinable: false,
  },

  own: {
    key: 'own',
    label: '仅自己创建的',
    description: '只能操作由自己创建的记录',
    conditions: {
      creatorId: '${user.id}',
    },
    icon: 'User',
    combinable: true,
  },

  team: {
    key: 'team',
    label: '同团队的',
    description: '只能操作与自己同团队的记录',
    conditions: {
      teamId: '${user.currentTeamId}',
    },
    applicableSubjects: ['Member', 'Media'],
    icon: 'Users',
    combinable: true,
  },

  department: {
    key: 'department',
    label: '同部门的',
    description: '只能操作同部门的记录（需要部门字段）',
    conditions: {
      departmentId: '${user.departmentId}',
    },
    applicableSubjects: ['Member'],
    icon: 'Building',
    combinable: true,
  },

  public: {
    key: 'public',
    label: '公开的',
    description: '只能操作已设为公开的记录',
    conditions: {
      visibility: 'public',
    },
    icon: 'Globe',
    combinable: true,
  },

  draft: {
    key: 'draft',
    label: '草稿状态',
    description: '只能操作草稿状态的记录',
    conditions: {
      status: 'draft',
    },
    applicableSubjects: ['Media'],
    icon: 'FileEdit',
    combinable: true,
  },

  published: {
    key: 'published',
    label: '已发布',
    description: '只能操作已发布的记录',
    conditions: {
      status: 'published',
    },
    applicableSubjects: ['Media'],
    icon: 'CheckCircle',
    combinable: true,
  },

  assigned: {
    key: 'assigned',
    label: '分配给自己的',
    description: '只能操作分配给自己的记录',
    conditions: {
      assigneeId: '${user.id}',
    },
    icon: 'UserCheck',
    combinable: true,
  },

  not_archived: {
    key: 'not_archived',
    label: '未归档的',
    description: '只能操作未归档的记录',
    conditions: {
      archivedAt: null,
    },
    icon: 'Archive',
    combinable: true,
  },
} as const;

/**
 * 预设键数组（用于验证）
 */
export const CONDITION_PRESET_KEYS = Object.keys(CONDITION_PRESETS) as ConditionPresetKey[];

/**
 * 组合多个预设的条件
 *
 * @param presetKeys - 预设键列表
 * @returns 合并后的 CASL conditions
 *
 * @example
 * combinePresets(['own', 'not_archived'])
 * // 返回: { $and: [{ creatorId: '${user.id}' }, { archivedAt: null }] }
 */
export function combinePresets(
  presetKeys: ConditionPresetKey[]
): Record<string, unknown> | null {
  // 过滤掉 'none' 和无效的预设
  const validKeys = presetKeys.filter(
    key => key !== 'none' && CONDITION_PRESETS[key]?.conditions !== null
  );

  if (validKeys.length === 0) {
    return null;
  }

  if (validKeys.length === 1) {
    return CONDITION_PRESETS[validKeys[0]].conditions;
  }

  return {
    $and: validKeys.map(key => CONDITION_PRESETS[key].conditions),
  };
}

/**
 * 获取资源可用的预设列表
 *
 * @param subject - 资源类型（如 'Member', 'Media'）
 * @returns 适用于该资源的预设列表
 */
export function getPresetsForSubject(subject: string): ConditionPreset[] {
  return Object.values(CONDITION_PRESETS).filter(preset => {
    // 无 applicableSubjects 限制的预设对所有资源可用
    if (!preset.applicableSubjects) return true;
    // 检查是否适用于当前资源
    return preset.applicableSubjects.includes(subject);
  });
}

/**
 * 验证预设是否适用于指定资源
 *
 * @param presetKey - 预设键
 * @param subject - 资源类型
 * @returns 验证结果
 */
export function validatePresetForSubject(
  presetKey: ConditionPresetKey,
  subject: string
): { valid: boolean; reason?: string } {
  const preset = CONDITION_PRESETS[presetKey];

  if (!preset) {
    return { valid: false, reason: `未知的预设: ${presetKey}` };
  }

  if (preset.applicableSubjects && !preset.applicableSubjects.includes(subject)) {
    return {
      valid: false,
      reason: `预设"${preset.label}"不适用于资源"${subject}"`,
    };
  }

  return { valid: true };
}

/**
 * 解析条件模板中的变量
 *
 * @param conditions - 包含模板变量的条件对象
 * @param context - 上下文对象（包含 user 等）
 * @returns 解析后的条件对象
 *
 * @example
 * resolveConditionTemplates(
 *   { creatorId: '${user.id}' },
 *   { user: { id: 'user-123' } }
 * )
 * // 返回: { creatorId: 'user-123' }
 */
export function resolveConditionTemplates(
  conditions: Record<string, unknown> | null,
  context: {
    user: {
      id: string;
      currentTeamId?: string;
      departmentId?: string;
      organizationId?: string;
    };
  }
): Record<string, unknown> | null {
  if (!conditions) return null;

  const templateRegex = /\$\{([^}]+)\}/;

  function resolveValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const match = value.match(templateRegex);
      if (match) {
        const path = match[1]; // e.g., "user.id"
        const parts = path.split('.');
        let result: unknown = context;

        for (const part of parts) {
          if (result && typeof result === 'object' && part in result) {
            result = (result as Record<string, unknown>)[part];
          } else {
            return undefined; // 路径不存在
          }
        }

        return result;
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }

    if (value !== null && typeof value === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = resolveValue(v);
      }
      return resolved;
    }

    return value;
  }

  return resolveValue(conditions) as Record<string, unknown>;
}

/**
 * 获取预设的用户友好描述
 *
 * @param presetKeys - 选中的预设键列表
 * @returns 人类可读的描述文本
 */
export function getPresetDescription(presetKeys: ConditionPresetKey[]): string {
  if (presetKeys.length === 0 || presetKeys.includes('none')) {
    return '可以操作所有数据';
  }

  const descriptions = presetKeys
    .filter(key => key !== 'none')
    .map(key => CONDITION_PRESETS[key]?.label || key);

  if (descriptions.length === 1) {
    return `只能操作${descriptions[0]}的数据`;
  }

  return `只能操作满足以下条件的数据：${descriptions.join('、')}`;
}
