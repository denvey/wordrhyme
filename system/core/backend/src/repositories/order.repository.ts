import { TDeleteManyInput, TOrder, TOrderFilter, TOrderInput, TPagedList, TPagedParams } from '@cromwell/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { EntityRepository, getCustomRepository, SelectQueryBuilder } from 'typeorm';
import { DateUtils } from 'typeorm/util/DateUtils';

import { getPaged, handleCustomMetaInput } from '../helpers/base-queries';
import { getLogger } from '../helpers/logger';
import { validateEmail } from '../helpers/validation';
import { Coupon } from '../models/entities/coupon.entity';
import { Order } from '../models/entities/order.entity';
import { BaseRepository } from './base.repository';
import { CouponRepository } from './coupon.repository';

const logger = getLogger();

@EntityRepository(Order)
export class OrderRepository extends BaseRepository<Order> {
  constructor() {
    super(Order);
  }

  async getOrders(params?: TPagedParams<TOrder>): Promise<TPagedList<Order>> {
    return this.getPaged(params);
  }

  async getOrderById(id: number): Promise<Order> {
    return this.getById(id);
  }

  async getOrderBySlug(slug: string): Promise<Order> {
    return this.getBySlug(slug);
  }

  private async handleBaseOrderInput(order: Order, input: TOrderInput) {
    if (input.customerEmail && !validateEmail(input.customerEmail))
      throw new HttpException('Provided e-mail is not valid', HttpStatus.BAD_REQUEST);

    order.status = input.status;
    order.cart = Array.isArray(input.cart) ? JSON.stringify(input.cart) : input.cart;
    order.orderTotalPrice = input.orderTotalPrice;
    order.cartTotalPrice = input.cartTotalPrice;
    order.cartOldTotalPrice = input.cartOldTotalPrice;
    order.shippingPrice = input.shippingPrice;
    order.totalQnt = input.totalQnt;
    order.userId = input.userId;
    order.customerName = input.customerName;
    order.customerPhone = input.customerPhone;
    if (order.customerPhone) {
      if (typeof order.customerPhone === 'number') order.customerPhone = order.customerPhone + '';
      order.customerPhone = order.customerPhone.replace(/\W/g, '');
    }
    order.customerEmail = input.customerEmail;
    order.customerAddress = input.customerAddress;
    order.customerComment = input.customerComment
      ? sanitizeHtml(input.customerComment, {
          allowedTags: [],
        })
      : undefined;
    order.shippingMethod = input.shippingMethod;
    order.paymentMethod = input.paymentMethod;
    order.currency = input.currency;

    if (input.couponCodes)
      order.coupons = await getCustomRepository(CouponRepository).getCouponsByCodes(input.couponCodes);

    await order.save();
    await handleCustomMetaInput(order as any, input);
  }

  async createOrder(inputData: TOrderInput, id?: number | null): Promise<Order> {
    let order = new Order();
    if (id) order.id = id;

    await this.handleBaseOrderInput(order, inputData);
    order = await this.save(order);
    return order;
  }

  async updateOrder(id: number, inputData: TOrderInput): Promise<Order> {
    let order = await this.getById(id);

    await this.handleBaseOrderInput(order, inputData);
    order = await this.save(order);
    return order;
  }

  async deleteOrder(id: number): Promise<boolean> {
    const order = await this.getOrderById(id);
    if (!order) {
      logger.log('OrderRepository::deleteOrder failed to find Order by id');
      return false;
    }
    await this.delete(id);
    return true;
  }

  applyOrderFilter(qb: SelectQueryBuilder<TOrder>, filterParams?: TOrderFilter) {
    this.applyBaseFilter(qb, filterParams);

    // Search by userId
    if (filterParams?.userId) {
      const query = `${this.metadata.tablePath}.userId = :userId`;
      qb.andWhere(query, { userId: filterParams.userId });
    }

    // Search by status
    if (filterParams?.status) {
      const query = `${this.metadata.tablePath}.status = :statusSearch`;
      qb.andWhere(query, { statusSearch: filterParams.status });
    }

    // Search by orderId
    if (filterParams?.orderId) {
      const query = `${this.metadata.tablePath}.id = :orderId`;
      qb.andWhere(query, { orderId: filterParams.orderId });
    }

    // Search by customerName
    if (filterParams?.customerName) {
      const customerNameSearch = `%${filterParams.customerName}%`;
      const query = `${this.metadata.tablePath}.${this.quote('customerName')} ${this.getSqlLike()} :customerNameSearch`;
      qb.andWhere(query, { customerNameSearch });
    }

    // Search by customerPhone
    if (filterParams?.customerPhone) {
      const customerPhone = filterParams.customerPhone.replace(/\W/g, '');
      const customerPhoneSearch = `%${customerPhone}%`;
      const query = `${this.metadata.tablePath}.${this.quote(
        'customerPhone',
      )} ${this.getSqlLike()} :customerPhoneSearch`;
      qb.andWhere(query, { customerPhoneSearch });
    }

    // Search by customerEmail
    if (filterParams?.customerEmail) {
      const customerEmailSearch = `%${filterParams.customerEmail}%`;
      const query = `${this.metadata.tablePath}.${this.quote(
        'customerEmail',
      )} ${this.getSqlLike()} :customerEmailSearch`;
      qb.andWhere(query, { customerEmailSearch });
    }

    // Search by create date
    if (filterParams?.dateFrom) {
      const dateFrom = new Date(Date.parse(filterParams.dateFrom));
      const dateTo = new Date(filterParams.dateTo ? Date.parse(filterParams.dateTo) : Date.now());

      const query = `${this.metadata.tablePath}.${this.quote('createDate')} BETWEEN :dateFrom AND :dateTo`;
      qb.andWhere(query, {
        dateFrom: DateUtils.mixedDateToDatetimeString(dateFrom),
        dateTo: DateUtils.mixedDateToDatetimeString(dateTo),
      });
    }
  }

  async getFilteredOrders(pagedParams?: TPagedParams<TOrder>, filterParams?: TOrderFilter): Promise<TPagedList<Order>> {
    const qb = this.createQueryBuilder(this.metadata.tablePath);
    qb.select();
    this.applyOrderFilter(qb, filterParams);
    return await getPaged<Order>(qb, this.metadata.tablePath, pagedParams);
  }

  async deleteManyFilteredOrders(input: TDeleteManyInput, filterParams?: TOrderFilter): Promise<boolean> {
    if (!filterParams) return this.deleteMany(input);

    const qbSelect = this.createQueryBuilder(this.metadata.tablePath).select([`${this.metadata.tablePath}.id`]);
    this.applyOrderFilter(qbSelect, filterParams);
    this.applyDeleteMany(qbSelect, input);

    const qbDelete = this.createQueryBuilder(this.metadata.tablePath)
      .delete()
      .where(`${this.metadata.tablePath}.id IN (${qbSelect.getQuery()})`)
      .setParameters(qbSelect.getParameters());

    await qbDelete.execute();
    return true;
  }

  async getOrdersOfUser(userId: number, pagedParams?: TPagedParams<TOrder>): Promise<TPagedList<Order>> {
    const qb = this.createQueryBuilder(this.metadata.tablePath);
    qb.select();
    qb.where(`${this.metadata.tablePath}.${this.quote('userId')} = :userId`, {
      userId,
    });
    return await getPaged<Order>(qb, this.metadata.tablePath, pagedParams);
  }

  async getCouponsOfOrder(id: number): Promise<Coupon[] | undefined | null> {
    return (
      await this.findOne(id, {
        relations: ['coupons'],
      })
    )?.coupons;
  }
}
