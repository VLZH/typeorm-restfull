import { validate } from "class-validator";
import statusCodes from "http-status-codes";
import RequestContext from "./RequestContext";
import {
    has,
    isArray,
    isFunction,
    isInteger,
    isNumber,
    isObject,
    isString,
    omit,
    pick
} from "lodash";
import queryString from "query-string";
import {
    FindManyOptions,
    FindOneOptions,
    getConnection,
    Repository,
    SelectQueryBuilder
} from "typeorm";
import { FindOptionsUtils } from "typeorm/find-options/FindOptionsUtils";
import { JoinAttribute } from "typeorm/query-builder/JoinAttribute";
import ApiListResponse from "./ApiListResponse";

/**
 *
 */
export type CallbackFunction<Entity> = (
    ctx: RequestContext,
    item: Entity,
    repository: Repository<Entity>
) => void | Promise<void>;

/**
 *
 */
export type CallbackFunctionList<Entity> = (
    ctx: RequestContext,
    item: Entity[],
    repository: Repository<Entity>
) => void | Promise<Entity[]>;

/**
 *
 */
export type CallbackFunctionPreGet<Entity> = (
    ctx: RequestContext,
    find_options: FindManyOptions<Entity>,
    repository: Repository<Entity>
) => FindManyOptions<Entity>;

// Callback options of ApiResource
export interface IApiResourceOptionsCallbacks<Entity> {
    afterDelete?: CallbackFunction<Entity>;
    // detail
    preDetail?: CallbackFunctionPreGet<Entity>;
    afterDetail?: CallbackFunction<Entity>;
    // list
    preList?: CallbackFunctionPreGet<Entity>;
    afterList?: CallbackFunctionList<Entity>;
    // patch
    prePatch?: CallbackFunction<Entity>;
    afterPatch?: CallbackFunction<Entity>;
    // post
    prePost?: CallbackFunction<Entity>;
    afterPost?: CallbackFunction<Entity>;
}

/**
 * Options of ApiResource
 */
export interface IApiResourceOptions<T>
    extends IApiResourceOptionsCallbacks<T> {
    detail_fields?: string[];
    filter?: () => void;
    take?: number;
    list_fields?: string[];
    relations?: string[];
    select?: string[];
    order?: { [P in keyof T]?: "DESC" | "ASC" };
}

/**
 *
 */
export interface IReqBundle {
    ctx: RequestContext;
    rtype: RequestTypes;
}

/**
 * Interface of response from request handler
 */
export interface IHandlerResponse {
    body?: string | object | any[];
    status: number;
}

interface IListHandlerResponse<Entity> extends IHandlerResponse {
    body: ApiListResponse<Entity>;
}

export interface IResourceLogger {
    debug: (text: any) => void;
    info: (text: any) => void;
    warn: (text: any) => void;
    error: (text: any) => void;
}

// Filter query key
type QueryKeyModification = "gt" | "gte" | "lt" | "lte" | "in";
const QueryKeyModifications = ["gt", "gte", "lt", "lte", "in"];
/**
 *
 */
interface IQueryKey {
    base: string;
    path: string[];
    modification?: QueryKeyModification;
    value: string | string[] | boolean | number;
}

enum RequestTypes {
    isDetail,
    isList,
    isPost,
    isDelete,
    isPatch
}

/**
 * Class for creating handler for some model
 * TODO: Разобраться с типами модели...
 */
export default class ApiModelResource<Entity> {
    private model: new () => Entity;
    private logger?: IResourceLogger;
    // callbacks
    private afterDelete: IApiResourceOptionsCallbacks<Entity>["afterDelete"];
    // detail
    private preDetail: IApiResourceOptionsCallbacks<Entity>["preDetail"];
    private afterDetail: IApiResourceOptionsCallbacks<Entity>["afterDetail"];
    // list
    private preList: IApiResourceOptionsCallbacks<Entity>["preList"];
    private afterList: IApiResourceOptionsCallbacks<Entity>["afterList"];
    // patch
    private prePatch: IApiResourceOptionsCallbacks<Entity>["prePatch"];
    private afterPatch: IApiResourceOptionsCallbacks<Entity>["afterPatch"];
    // post
    private prePost: IApiResourceOptionsCallbacks<Entity>["afterPost"];
    private afterPost: IApiResourceOptionsCallbacks<Entity>["afterPost"];
    // options
    private relations: string[];
    private take: number;
    private select: string[];
    private order: IApiResourceOptions<Entity>["order"];

    constructor(
        model: new () => Entity,
        options: IApiResourceOptions<Entity>,
        logger?: IResourceLogger
    ) {
        this.model = model;
        this.logger = logger;
        Object.assign(this, options);
    }

    public getModel() {
        return this.model;
    }

    private getRepo(): Repository<Entity> {
        return getConnection().getRepository(this.model);
    }

    /**
     * ======================================
     * HANDLERS AND ADDINT THEM TO THE ROUTER
     * ======================================
     */

    /**
     * Handler on GET "api/models/"
     */
    public async getList(
        ctx: RequestContext
    ): Promise<IListHandlerResponse<Entity>> {
        let findOptions = await this.buildFindOptions({
            ctx,
            rtype: RequestTypes.isList
        });
        findOptions = this.preList
            ? this.preList(ctx, findOptions, this.getRepo())
            : findOptions;
        let items;
        let total;
        const qb = this.buildSelectQueryBuilder(
            {
                ctx,
                rtype: RequestTypes.isList
            },
            findOptions
        );
        [items, total] = await qb.getManyAndCount();
        if (this.afterList) {
            items = (await this.afterList(ctx, items, this.getRepo())) || items;
        }
        return {
            body: new ApiListResponse(
                items,
                qb,
                total,
                items.length,
                ctx.query,
                "http://localhost/"
            ),
            status: statusCodes.OK
        };
    }
    /**
     * Handler on GET "api/models/:id"
     */
    public async getDetail(ctx: RequestContext): Promise<IHandlerResponse> {
        let findOptions = await this.buildFindOptions({
            ctx,
            rtype: RequestTypes.isDetail
        });
        findOptions = this.preDetail
            ? this.preDetail(ctx, findOptions, this.getRepo())
            : findOptions;
        const item = await this.getRepo().findOne(+ctx.params.id, findOptions);
        return {
            body: this.jsonSerialize(item),
            status: statusCodes.OK
        };
    }
    /**
     * Handler on POST "api/models/"
     */
    public async postDetail(ctx: RequestContext) {
        let item = new (this.model as any)(ctx.body);
        const errors = await validate(item);
        if (errors.length) {
            if (this.logger) {
                this.logger.error(
                    `Error on POST ${ctx.path}  
                    errors: \n ${errors}`
                );
            }
            return {
                body: errors.map(error => error.property).join("\n"),
                status: statusCodes.BAD_REQUEST
            };
        }
        item = await this.upgradeData(item);
        if (this.prePost) {
            await this.prePost(ctx, item, this.getRepo());
        }
        try {
            item = await this.getRepo().save(item);
        } catch (error) {
            if (this.logger) {
                this.logger.error(error);
                throw new Error("Error in creating new ");
            }
        }
        if (this.afterPost) {
            await this.afterPost(ctx, item, this.getRepo());
        }
        return {
            body: this.jsonSerialize(item),
            status: statusCodes.CREATED
        };
    }
    /**
     * Handler on PATCH "api/models/:id/"
     */
    public async patchDetail(ctx: RequestContext) {
        let item: any = await this.getRepo().findOne(+ctx.params.id);
        if (!item) {
            return {
                body: item,
                status: statusCodes.NOT_FOUND
            };
        }

        const clear_body = this.filterDataForPatch(ctx.body);
        Object.assign(item, clear_body);

        item = await this.upgradeData(item);
        if (this.prePatch) {
            await this.prePatch(ctx, item, this.getRepo());
        }
        try {
            const savedItem = await this.getRepo().save(item);
            if (this.afterPatch) {
                await this.afterPatch(ctx, item, this.getRepo());
            }
            return {
                body: this.jsonSerialize(savedItem),
                status: statusCodes.CREATED
            };
        } catch (error) {
            if (this.logger) {
                this.logger.error(error);
            }
            return {
                body: "INTERNAL_SERVER_ERROR",
                status: statusCodes.INTERNAL_SERVER_ERROR
            };
        }
    }
    /**
     * Handler on DELETE "api/models/"
     */
    public async deleteDetail(ctx: RequestContext) {
        await this.getRepo().delete(+ctx.params.id);
        return {
            body: "",
            status: statusCodes.NO_CONTENT
        };
    }
    /**
     * Ignore read-only fields
     */
    private filterDataForPatch(body: any) {
        let bod = { ...body };
        if ((this.model as any).updatableFields.length) {
            bod = pick(bod, (this.model as any).updatableFields);
        }
        if ((this.model as any).notUpdatableFields.length) {
            bod = omit(bod, (this.model as any).notUpdatableFields);
        }
        return bod;
    }

    /**
     * =====================
     * CREATE RESPONSE
     * =====================
     */

    /**
     * Conver some data to JSON
     */
    private jsonSerialize(data: any) {
        return JSON.stringify(
            data,
            (key, value) => (value === undefined ? null : value)
        );
    }

    /**
     * ===========================
     * CREATE SELECT QUERY BUILDER
     * ===========================
     */

    /**
     *
     */
    private buildSelectQueryBuilder(
        b: IReqBundle,
        fo: FindManyOptions<Entity>
    ): SelectQueryBuilder<Entity> {
        let qb = this.getRepo().createQueryBuilder(this.model.name);
        qb = FindOptionsUtils.applyOptionsToQueryBuilder(qb, fo);
        // qb = this.applyRelations(qb);
        qb = this.applyWhere(b, qb);
        qb = this.applySkip(b, qb);
        qb = this.applyTake(b, qb);
        return qb;
    }

    private prepareQueryKey(key: string, value: IQueryKey["value"]): IQueryKey {
        const parts = key.split("__");
        return {
            base: parts[0],
            modification: undefined,
            path: parts.slice(1),
            value
        };
    }

    // TODO: Recursive applying
    // private applyRelations(qb: SelectQueryBuilder<Entity>) {
    //     this.relations.map(r => {
    //         if (this.isRelation(r)) {
    //             qb = qb.leftJoinAndSelect(`${this.model.name}.${r}`, r);
    //         }
    //     });
    //     return qb;
    // }

    private applyWhere(b: IReqBundle, qb: SelectQueryBuilder<Entity>) {
        const repo = this.getRepo();
        for (const skey in b.ctx.query) {
            const val = b.ctx.query[skey];
            const key = this.prepareQueryKey(skey, val);
            if (this.isField(key)) {
                // For relation
                const isRel =
                    this.isOneToMany(key) ||
                    this.isManyToOne(key) ||
                    this.isOneToOne(key) ||
                    this.isManyToMany(key);
                if (isRel) {
                    let join_attr;
                    const property = `${qb.alias}.${isRel.propertyPath}`;
                    [qb, join_attr] = this.addOrGetRelation(
                        qb,
                        property,
                        isRel.propertyPath
                    );
                    qb.andWhere(
                        `${join_attr.alias.name}.${key.path[0]} = :${
                            key.path[0]
                        }`,
                        { [key.path[0]]: key.value }
                    );
                    continue;
                }
                // isSimple
                qb = qb.andWhere(
                    `${this.model.name}.${key.base}=:${key.base}`,
                    {
                        [key.base]: val
                    }
                );
            } else {
                console.log("is not property", key);
            }
        }
        return qb;
    }

    private applySkip(b: IReqBundle, qb: SelectQueryBuilder<Entity>) {
        const offset = b.ctx.query.offset ? +b.ctx.query.offset : 0;
        return qb.skip(offset);
    }
    private applyTake(b: IReqBundle, qb: SelectQueryBuilder<Entity>) {
        const limit = b.ctx.query.limit ? +b.ctx.query.limit : this.take;
        return qb.take(limit);
    }

    private addOrGetRelation(
        qb: SelectQueryBuilder<Entity>,
        property: string,
        propertyPath: string
    ): [SelectQueryBuilder<Entity>, JoinAttribute] {
        for (const join_attr of qb.expressionMap.joinAttributes) {
            if (join_attr.entityOrProperty === property) {
                return [qb, join_attr];
            }
        }
        console.log("JoidAttribute is not found");
        qb = qb.leftJoinAndSelect(property, propertyPath);
        return this.addOrGetRelation(qb, property, propertyPath);
    }

    /**
     * =====================
     * FIND OPTIONS BUILDING
     * =====================
     */

    // Parse request options
    private async buildFindOptions(
        b: IReqBundle
    ): Promise<FindManyOptions<Entity>> {
        return {
            order: this.buildOrder(b),
            relations: this.buildRelations(b),
            select: this.buildSelect(b)
        };
    }

    private buildOrder(b: IReqBundle): IApiResourceOptions<Entity>["order"] {
        // Multi value ordering
        const ordered = !!b.ctx.query.order_by;
        const order_by: string = b.ctx.query.order_by as string;
        if (!ordered) {
            return this.order;
        }
        const [order, key] =
            order_by[0] === "-"
                ? ["DESC", order_by.slice(1)]
                : ["ASC", order_by];
        if (!has(new this.model(), key)) {
            return {};
        }

        const result = key
            ? {
                  [key]: order as "DESC" | "ASC"
              }
            : {};
        return result as IApiResourceOptions<Entity>["order"];
    }
    /**
     * Return undefined if all field are selected
     */
    private buildSelect(b: IReqBundle): Array<keyof Entity> {
        const keys = b.ctx.query.select
            ? (b.ctx.query.select as string).split(",")
            : this.select.length
                ? this.select
                : undefined;
        return keys as Array<keyof Entity>;
    }
    private buildRelations(b: IReqBundle): string[] {
        return this.relations || [];
    }

    /**
     * =========================
     * MODIFY DATA FROM USER TO RIGHT FORM
     * =========================
     */

    /**
     * Convert data to right form
     */
    private async upgradeData(data: any) {
        const repo = this.getRepo();
        if (typeof data !== "object") {
            return;
        }

        // set models instead itegers in ManyToMany
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                const isManyToMany = this.isManyToMany(key);
                if (!isManyToMany) {
                    continue;
                }
                const value = data[key];
                if (Array.isArray(value) && isNumber(value[0])) {
                    // data[key] = isManyToMany.
                }
            }
        }

        // some objects or number to right class
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                const isOneToMany = this.isOneToMany(key);
                const isManyToOne = this.isManyToOne(key);
                const isOneToOne = this.isOneToOne(key);
                if (!isOneToMany && !isManyToOne && !isOneToOne) {
                    continue;
                }
                const value = data[key];

                // is isOneToMany array of objects
                if (
                    isOneToMany &&
                    isArray(value) &&
                    isFunction(isOneToMany.type)
                ) {
                    data[key] = data[key].map(
                        (i: any) => new (isOneToMany.type as any)(i)
                    );
                }

                // is isManyToOne object
                if (
                    isManyToOne &&
                    isObject(value) &&
                    isFunction(isManyToOne.type)
                ) {
                    data[key] = new (isManyToOne.type as any)(value);
                }

                // is isManyToOne integer
                if (
                    isManyToOne &&
                    isInteger(value) &&
                    isFunction(isManyToOne.type)
                ) {
                    data[key] = await getConnection()
                        .getRepository(isManyToOne.type)
                        .findOne(value);
                }

                // is isOneToOne object
                if (
                    isOneToOne &&
                    isObject(value) &&
                    isFunction(isOneToOne.type)
                ) {
                    data[key] = new (isOneToOne.type as any)(value);
                }
            }
        }

        // convert id of parent
        if (
            repo.metadata.treeType === "materialized-path" &&
            repo.metadata.treeParentRelation
        ) {
            const parentPropertyName =
                repo.metadata.treeParentRelation.propertyName;
            if (data.hasOwnProperty(parentPropertyName)) {
                const parent = await this.getRepo().findOne(
                    data[parentPropertyName]
                );
                if (parent) {
                    data[parentPropertyName] = parent;
                }
            }
        }
        return data;
    }
    /**
     * Check key in repo and return RelationMetadata of undefined
     */
    private isManyToMany(key: string | IQueryKey) {
        const repo = this.getRepo();
        for (const field of repo.metadata.ownerManyToManyRelations) {
            if (field.propertyName === (isString(key) ? key : key.base)) {
                return field;
            }
        }
    }

    /**
     * Is OneToMany field
     */
    private isOneToMany(key: string | IQueryKey) {
        const repo = this.getRepo();
        for (const field of repo.metadata.oneToManyRelations) {
            if (field.propertyName === (isString(key) ? key : key.base)) {
                return field;
            }
        }
    }
    /**
     * Is ManyToOne field
     */
    private isManyToOne(key: string | IQueryKey) {
        const repo = this.getRepo();
        for (const field of repo.metadata.manyToOneRelations) {
            if (field.propertyName === (isString(key) ? key : key.base)) {
                return field;
            }
        }
    }

    private isOneToOne(key: string | IQueryKey) {
        const repo = this.getRepo();
        for (const field of repo.metadata.oneToOneRelations) {
            if (field.propertyName === (isString(key) ? key : key.base)) {
                return field;
            }
        }
    }

    private isRelation(key: string | IQueryKey) {
        const repo = this.getRepo();
        // find in relations
        for (const field of repo.metadata.ownRelations) {
            if (field.propertyName === (isString(key) ? key : key.base)) {
                return field;
            }
        }
    }

    private isSimple(key: string | IQueryKey) {
        const repo = this.getRepo();
        // find in relations
        for (const field of repo.metadata.nonVirtualColumns) {
            if (field.propertyName === (isString(key) ? key : key.base)) {
                return field;
            }
        }
    }

    private isField(key: string | IQueryKey) {
        const repo = this.getRepo();
        // find in simple columns
        return this.isRelation(key) || this.isSimple(key);
    }
}
