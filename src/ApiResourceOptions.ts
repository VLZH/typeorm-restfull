import { DeleteResult, SelectQueryBuilder } from "typeorm";
import RequestContext, { ApiRequestType } from "./RequestContext";

export type IPreInsertCallback<Entity> = (
    ctx: RequestContext,
    data: Entity
) => Promise<{ [key: string]: any }>;

export type IAfterInsertCallback<Entity> = (
    ctx: RequestContext,
    item: Entity
) => Promise<Entity>;

export type IPreGetCallback<Entity> = (
    ctx: RequestContext,
    qb: SelectQueryBuilder<Entity>
) => Promise<SelectQueryBuilder<Entity>>;

export type IAccessCallback<Entity> = (ctx: RequestContext) => boolean;

// Callback options of ApiResource
export interface IApiResourceOptionsCallbacks<Entity> {
    afterDelete?: (ctx: RequestContext, deleted_item: DeleteResult) => void;
    // detail
    preDetail?: IPreGetCallback<Entity>;
    afterDetail?: (ctx: RequestContext, item: Entity) => Promise<Entity>;
    // list
    preList?: IPreGetCallback<Entity>;
    afterList?: (ctx: RequestContext, items: Entity[]) => Promise<Entity[]>;
    // patch
    prePatch?: IPreInsertCallback<Entity>;
    afterPatch?: IAfterInsertCallback<Entity>;
    // post
    prePost?: IPreInsertCallback<Entity>;
    afterPost?: IAfterInsertCallback<Entity>;
    // access
    hasAccess?: IAccessCallback<Entity>;
}

/**
 * Options of ApiResource
 */
export interface IApiResourceOptions<T>
    extends IApiResourceOptionsCallbacks<T> {
    take?: number;
    relations?: string[];
    select?: string[]; // TODO: implement this option
    order?: { [P in keyof T]?: "DESC" | "ASC" }; // TODO: implement this option
    additional_special_query_keys?: string[];
}
