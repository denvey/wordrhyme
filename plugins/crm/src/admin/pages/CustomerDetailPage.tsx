import React, { useState } from 'react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { contactSchema } from '../schemas';
import { useCrmApi } from '../trpc';


export function CustomerDetailPage({ customerId, onBack }: { customerId: string; onBack: () => void }) {
    const crmApi = useCrmApi() as any;
    const { data: customer, isLoading } = crmApi.customers.get.useQuery(customerId);
    const [refreshKey, setRefreshKey] = useState(0);

    const resource = useAutoCrudResource({
        router: crmApi.contacts,
        schema: contactSchema,
        query: (params) => ({
            ...params,
            filters: [
                ...(params.filters || []),
                {
                    id: 'customerId',
                    value: customerId,
                    variant: 'text',
                    operator: 'eq',
                    filterId: 'customer_id_filter_exact',
                },
            ],
        }),
        options: {
            hooks: {
                beforeCreate: async (values: any) => ({
                    ...values,
                    customerId, // Force customer ID to the current customer
                }),
            },
        },
    });

    if (isLoading) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">加载客户信息中...</div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">未找到该客户</div>
                <button className="mt-4 text-sm text-primary hover:underline" onClick={onBack}>
                    返回客户列表
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    className="h-9 px-3 rounded-md border text-sm hover:bg-muted"
                    onClick={onBack}
                >
                    返回
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold truncate">{customer.name}</h1>
                    <p className="text-muted-foreground text-sm">组织内部客户 ID: {customer.id}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-secondary text-secondary-foreground">
                    {customer.status}
                </span>
            </div>

            {/* Contacts Table (Specific to this customer) */}
            <div className="mt-8" key={refreshKey}>
                <AutoCrudTable
                    title="联系人列表"
                    schema={contactSchema}
                    resource={resource}
                    fields={{
                        id: { hidden: true },
                        organizationId: { hidden: true },
                        aclTags: { hidden: true },
                        denyTags: { hidden: true },
                        createdAt: { hidden: true },
                        updatedAt: { hidden: true },
                        archivedAt: { hidden: true },
                        // Hide the customerId field entirely in the detail view
                        customerId: { hidden: true, table: false, form: false },
                        fullName: { label: '姓名' },
                        jobTitle: { label: '职位' },
                        contactType: {
                            label: '主要联系类型',
                            form: { hidden: true },
                        },
                        contactValue: {
                            label: '主要联系方式',
                            form: { hidden: true },
                        },
                        contactMethods: {
                            label: '联系方式',
                            table: false,
                            form: {
                                type: 'array',
                                'x-component': 'ArrayCards',
                                title: '联系方式',
                                description: '排在第一位的联系方式将自动被提取为主要联系方式，在表格中直接展示。',
                                items: {
                                    type: 'object',
                                    properties: {
                                        type: {
                                            type: 'string',
                                            title: '渠道',
                                            required: true,
                                            'x-decorator': 'FormItem',
                                            'x-decorator-props': {
                                                style: { display: 'inline-block', width: '140px', marginRight: '16px', verticalAlign: 'top' },
                                            },
                                            'x-component': 'Select',
                                            enum: [
                                                { label: '邮箱', value: 'email' },
                                                { label: '手机', value: 'phone' },
                                                { label: '座机', value: 'tel' },
                                                { label: '微信', value: 'wechat' },
                                                { label: 'WhatsApp', value: 'whatsapp' },
                                                { label: '领英', value: 'linkedin' },
                                                { label: '其他', value: 'other' },
                                            ],
                                        },
                                        value: {
                                            type: 'string',
                                            title: '号码/账号',
                                            required: true,
                                            'x-decorator': 'FormItem',
                                            'x-decorator-props': {
                                                style: { display: 'inline-block', width: 'calc(100% - 156px)', verticalAlign: 'top' },
                                            },
                                            'x-component': 'Input',
                                        },
                                    },
                                },
                                properties: {
                                    add: {
                                        type: 'void',
                                        title: '添加联系方式',
                                        'x-component': 'ArrayCards.Addition',
                                    },
                                },
                            },
                        },
                        isPrimary: { label: '主联系人' },
                        status: {
                            label: '状态',
                            form: {
                                'x-component': 'Select',
                                enum: [
                                    { label: '启用', value: 'active' },
                                    { label: '归档', value: 'archived' },
                                ],
                            },
                        },
                        remark: {
                            label: '备注',
                            form: { 'x-component': 'Textarea' },
                        },
                    }}
                    table={{
                        filterModes: ['simple'],
                        defaultSort: [{ id: 'updatedAt', desc: true }],
                    }}
                    {...{
                        actions: [
                            { type: 'edit' },
                            { type: 'delete', separator: true },
                        ],
                    } as any}
                />
            </div>
        </div>
    );
}

export default CustomerDetailPage;
