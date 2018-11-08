import { validate } from "class-validator";
import statusCodes from "http-status-codes";
import {
    cloneDeep,
    isArray,
    isFunction,
    isInteger,
    isObject,
    isString,
    omit,
    pick
} from "lodash";
import {
    getConnection,
    ObjectType,
    Repository,
    SelectQueryBuilder as SQB
} from "typeorm";
import { FindOptionsUtils } from "typeorm/find-options/FindOptionsUtils";
import { JoinAttribute } from "typeorm/query-builder/JoinAttribute";
import { PlainObjectToNewEntityTransformer } from "typeorm/query-builder/transformer/PlainObjectToNewEntityTransformer";
import ApiListResponse from "./ApiListResponse";
import {
    IAccessCallback,
    IApiResourceOptions,
    IApiResourceOptionsCallbacks,
    RequestMethods
} from "./ApiResourceOptions";
import {
    BadMethodError,
    BadRequestError,
    InvalidQueryKey,
    NotFoundError,
    UnauthorizedError
} from "./exceptions";
import {
    IQueryKey,
    QueryKeyModificator,
    QueryKeyModificatorsList,
    SpecialQueryKeys
} from "./IQueryKey";
import RequestContext from "./RequestContext";

export type SelectQueryBuilder<Entity> = SQB<Entity>;

/**
 * Interface of response from request handler
 */
export interface IHandlerResponse {
    body?: string | object | any[];
    status: number;
    error?: Error;
}

export interface IListHandlerResponse<Entity> extends IHandlerResponse {
    body: ApiListResponse<Entity> | string;
}

export interface IResourceLogger {
    debug: (text: any) => void;
    info: (text: any) => void;
    warn: (text: any) => void;
    error: (text: any) => void;
}

/**
 * Class for creating handler for some model
 * TODO: Разобраться с типами модели...
 */
export default class BaseApiResource<Entity> {
    private model: ObjectType<Entity>;
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
    private prePost: IApiResourceOptionsCallbacks<Entity>["prePost"];
    private afterPost: IApiResourceOptionsCallbacks<Entity>["afterPost"];
    // access
    private hasAccess: IAccessCallback<Entity>;
    // options
    private allowed_methods: RequestMethods[];
    private relations?: string[];
    private take: number;
    private select?: string[];
    private order: IApiResourceOptions<Entity>["order"];
    private additional_special_query_keys?: string[];
    //
    private plainTransformer: PlainObjectToNewEntityTransformer;

    constructor(
        model: ObjectType<Entity>,
        options: IApiResourceOptions<Entity>,
        logger?: IResourceLogger
    ) {
        this.model = model;
        this.logger = logger;
        // callbacks
        this.afterDelete = options.afterDelete;
        this.preDetail = options.preDetail;
        this.afterDetail = options.afterDetail;
        this.preList = options.preList;
        this.afterList = options.afterList;
        this.prePatch = options.prePatch;
        this.afterPatch = options.afterPatch;
        this.prePost = options.prePost;
        this.afterPost = options.afterPost;
        this.hasAccess = options.hasAccess || (() => true);
        //
        this.allowed_methods = options.allowed_methods || [
            "GET",
            "POST",
            "PATCH",
            "DELETE"
        ];
        this.relations = options.relations;
        this.take = options.take || 10;
        this.select = options.select || undefined;
        this.order = options.order;
        this.additional_special_query_keys =
            options.additional_special_query_keys;
        //
        this.plainTransformer = new PlainObjectToNewEntityTransformer();
    }

    public reverseEndpointUrl() {
        const error_message =
            "Please. Declare correct reverseEndpointUrl method";
        if (this.logger) {
            this.logger.error(error_message);
        } else {
            console.error(error_message);
        }
        return "";
    }

    public getModel() {
        return this.model;
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
        if (!this.allowed_methods.includes("GET")) {
            throw new BadMethodError();
        }
        if (!this.hasAccess(ctx)) {
            throw new UnauthorizedError();
        }
        let items;
        let total;
        let qb = await this.buildSelectQueryBuilder(ctx);
        if (this.preList) {
            qb = await this.preList(ctx, qb);
        }
        [items, total] = await qb.getManyAndCount();
        if (this.afterList) {
            items = await this.afterList(ctx, items);
        }
        return {
            body: new ApiListResponse(
                items,
                qb,
                total,
                items.length,
                ctx.query,
                this.reverseEndpointUrl()
            ),
            status: statusCodes.OK
        };
    }
    /**
     * Handler on GET "api/models/:id"
     */
    public async getDetail(ctx: RequestContext): Promise<IHandlerResponse> {
        if (!ctx.params.id || !+ctx.params.id) {
            throw new BadRequestError();
        }
        if (!this.allowed_methods.includes("GET")) {
            throw new BadMethodError();
        }
        if (!this.hasAccess(ctx)) {
            throw new UnauthorizedError();
        }
        let qb = await this.buildSelectQueryBuilder(ctx);
        if (this.preDetail) {
            qb = await this.preDetail(ctx, qb);
        }
        let item = await qb
            .where(`${qb.alias}.id = :id`, { id: +ctx.params.id })
            .getOne();
        if (this.afterDetail && item) {
            item = await this.afterDetail(ctx, item);
        }
        return {
            body: this.jsonSerialize(item),
            status: statusCodes.OK
        };
    }
    /**
     * Handler on POST "api/models/"
     */
    public async postDetail(ctx: RequestContext) {
        if (!isObject(ctx.body)) {
            throw new BadRequestError();
        }
        if (!this.allowed_methods.includes("POST")) {
            throw new BadMethodError();
        }
        if (!this.hasAccess(ctx)) {
            throw new UnauthorizedError();
        }
        const repo = this.getRepo();
        const incoming_data = await this.prepareIncomingData(
            ctx.body as object
        );
        let item = repo.metadata.create();
        this.plainTransformer.transform(item, incoming_data, repo.metadata);
        await this.check_valid(item);
        if (this.prePost) {
            item = await this.prePost(ctx, item);
        }
        try {
            item = await this.getRepo().save(item);
        } catch (error) {
            if (this.logger) {
                this.logger.error(error);
            }
            throw new Error("Error in creating new ");
        }
        if (this.afterPost) {
            item = await this.afterPost(ctx, item);
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
        if (!isObject(ctx.body) || !ctx.params.id || !+ctx.params.id) {
            throw new BadRequestError();
        }
        if (!this.allowed_methods.includes("PATCH")) {
            throw new BadMethodError();
        }
        if (!this.hasAccess(ctx)) {
            throw new UnauthorizedError();
        }
        const incoming_data = await this.prepareIncomingData(
            ctx.body as object
        );
        const repo = this.getRepo();
        let item: any = await repo.findOne(+ctx.params.id);
        if (!item) {
            throw new NotFoundError();
        }
        const clear_body = this.filterDataForPatch(incoming_data);
        this.plainTransformer.transform(item, clear_body as any, repo.metadata);
        if (this.prePatch) {
            item = await this.prePatch(ctx, item);
        }
        const savedItem = await this.getRepo().save(item);
        if (this.afterPatch) {
            item = this.afterPatch(ctx, item);
        }
        return {
            body: this.jsonSerialize(savedItem),
            status: statusCodes.CREATED
        };
    }
    /**
     * Handler on DELETE "api/models/"
     */
    public async deleteDetail(ctx: RequestContext) {
        if (!ctx.params.id || !+ctx.params.id) {
            throw new BadRequestError();
        }
        if (!this.allowed_methods.includes("DELETE")) {
            throw new BadMethodError();
        }
        if (!this.hasAccess(ctx)) {
            throw new UnauthorizedError();
        }
        const deleted = await this.getRepo().delete(+ctx.params.id);
        if (this.afterDelete) {
            this.afterDelete(ctx, deleted);
        }
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

    private async buildSelectQueryBuilder(
        ctx: RequestContext
    ): Promise<SelectQueryBuilder<Entity>> {
        let qb = this.getRepo().createQueryBuilder(this.model.name);
        qb = FindOptionsUtils.applyOptionsToQueryBuilder(qb, {
            relations: this.relations || []
        });
        // qb = this.applyRelations(qb);
        qb = await this.applyWhere(ctx, qb);
        qb = await this.applySkip(ctx, qb);
        qb = await this.applyTake(ctx, qb);
        return qb;
    }

    private isModificator(s: string | QueryKeyModificator) {
        return QueryKeyModificatorsList.includes(s as QueryKeyModificator);
    }

    private prepareQueryKey(key: string, value: IQueryKey["value"]): IQueryKey {
        const parts = key.split("__");
        // check last part on modificator
        const qk: IQueryKey = {
            base: parts[0],
            modification: undefined,
            path: parts.slice(1).filter(i => !this.isModificator(i)),
            value
        };
        if (
            parts &&
            parts.length &&
            this.isModificator(parts[parts.length - 1])
        ) {
            qk.modification = parts[parts.length - 1] as QueryKeyModificator;
        }
        if (
            ["in", "not_in"].includes(qk.modification as string) &&
            isString(qk.value)
        ) {
            qk.value = qk.value.split(",");
        }
        return qk;
    }

    private getRepo(): Repository<Entity> {
        return getConnection().getRepository(this.model);
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

    /* tslint:disable */
    public async applyWhere(
        ctx: RequestContext,
        qb: SelectQueryBuilder<Entity>
    ) {
        for (const skey in ctx.query) {
            const key = this.prepareQueryKey(skey, ctx.query[skey]);
            if (
                SpecialQueryKeys.includes(key.base) ||
                (this.additional_special_query_keys &&
                    this.additional_special_query_keys.includes(key.base))
            ) {
                continue;
            }
            if (this.isField(key)) {
                // For relation
                const isRel =
                    this.isOneToMany(key) ||
                    this.isManyToOne(key) ||
                    this.isOneToOne(key) ||
                    this.isManyToMany(key);
                //
                if (isRel) {
                    // add where for relation
                    let join_attr;
                    // TODO maybe, can i not use this line?
                    const property = `${qb.alias}.${isRel.propertyPath}`;
                    [qb, join_attr] = this.addOrGetRelation(
                        qb,
                        property,
                        isRel.propertyPath
                    );
                    qb = this.addWhere(
                        key,
                        qb,
                        join_attr.alias.name,
                        key.path[0],
                        key.value
                    );
                } else {
                    // add where for simple value
                    qb = this.addWhere(
                        key,
                        qb,
                        this.model.name,
                        key.base,
                        key.value
                    );
                }
            } else {
                throw new InvalidQueryKey();
            }
        }
        return qb;
    }

    /**
     * 
     * @param key 
     * @param qb 
     * @param alias 
     * @param field 
     * @param value 
     */
    private addWhere(
        key: IQueryKey,
        qb: SelectQueryBuilder<Entity>,
        alias: string,
        field: string,
        value: IQueryKey["value"]
    ) {
        // Use IN if value is Array
        // TODO: Think about this...
        if (isArray(value)) {
            key.modification = "in";
        }
        let operator = "=";
        let [wrapper_start, wrapper_end] = [":", ""];
        switch (key.modification) {
            case "gt":
                operator = ">";
                break;
            case "gte":
                operator = ">=";
                break;
            case "lt":
                operator = "<";
                break;
            case "lte":
                operator = "<=";
                break;
            case "in":
                operator = "IN";
                wrapper_start = "(:...";
                wrapper_end = ")";
                if (!isArray(key.value)) {
                    throw new InvalidQueryKey();
                }
                break;
            case "not_in":
                operator = "NOT IN";
                wrapper_start = "(:...";
                wrapper_end = ")";
                if (!isArray(key.value)) {
                    throw new InvalidQueryKey();
                }
                break;
            case "not":
                operator = "!=";
                break;
        }
        // create function for adding value to
        const applyToQb = (
            qb: SelectQueryBuilder<Entity>,
            v: IQueryKey["value"]
        ) =>
            qb.andWhere(
                `${alias}.${field} ${operator} ${wrapper_start}${field}${wrapper_end}`,
                {
                    [field]: v
                }
            );
        return applyToQb(qb, value);
    }

    /* tslint:enable */

    private async applySkip(
        ctx: RequestContext,
        qb: SelectQueryBuilder<Entity>
    ) {
        const offset = ctx.query.offset ? +ctx.query.offset : 0;
        return qb.skip(offset);
    }
    private async applyTake(
        ctx: RequestContext,
        qb: SelectQueryBuilder<Entity>
    ) {
        const limit = ctx.query.limit ? +ctx.query.limit : this.take;
        return qb.take(limit);
    }

    /**
     * TODO: write description!
     * @param qb
     * @param property_path path in the parent object
     * @param alias alias for using in another operations over QueryBuilder
     */
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
        qb = qb.leftJoinAndSelect(property, propertyPath);
        return this.addOrGetRelation(qb, property, propertyPath);
    }

    private async check_valid(item: any) {
        const errors = await validate(item);
        if (errors.length) {
            throw new Error(`Validate error; \n ${errors.join(";")}`);
        }
    }

    /**
     * Convert incoming data to right form
     */
    private async prepareIncomingData(data: { [key: string]: any }) {
        const result = cloneDeep(data);
        const repo = this.getRepo();

        // some objects or number to right class
        for (const key in result) {
            if (result.hasOwnProperty(key)) {
                const isOneToMany = this.isOneToMany(key);
                const isManyToOne = this.isManyToOne(key);
                const isOneToOne = this.isOneToOne(key);
                const value = result[key];
                if ((!isOneToMany && !isManyToOne && !isOneToOne) || !value) {
                    continue;
                }

                // is isOneToMany array of objects
                if (
                    isOneToMany &&
                    isArray(value) &&
                    isFunction(isOneToMany.type)
                ) {
                    result[key] = result[key].map(
                        (i: any) => new (isOneToMany.type as any)(i)
                    );
                }

                // is isManyToOne object
                if (
                    isManyToOne &&
                    isObject(value) &&
                    isFunction(isManyToOne.type)
                ) {
                    result[key] = new (isManyToOne.type as any)(value);
                }

                // is isManyToOne integer
                if (
                    isManyToOne &&
                    isInteger(value) &&
                    isFunction(isManyToOne.type)
                ) {
                    result[key] = await getConnection()
                        .getRepository(isManyToOne.type)
                        .findOne(value);
                }

                // is isOneToOne object
                if (
                    isOneToOne &&
                    isObject(value) &&
                    isFunction(isOneToOne.type)
                ) {
                    result[key] = new (isOneToOne.type as any)(value);
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
            if (
                result.hasOwnProperty(parentPropertyName) &&
                result[parentPropertyName]
            ) {
                const parent = await this.getRepo().findOne(
                    result[parentPropertyName]
                );
                if (parent) {
                    result[parentPropertyName] = parent;
                }
            }
        }
        return result;
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
