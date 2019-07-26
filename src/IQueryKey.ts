// Filter query key
export type QueryKeyModificator =
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "not_in"
    | "not"
    | "count_eq"
    | "count_gt"
    | "count_gte"
    | "count_lt"
    | "count_lte";

export const QueryKeyModificatorsList: QueryKeyModificator[] = [
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "not",
    "count_eq",
    "count_gt",
    "count_gte",
    "count_lt",
    "count_lte"
];

export const SpecialQueryKeys = ["limit", "offset", "order_by"];
/**
 *
 */
export interface IQueryKey {
    base: string;
    path: string[];
    modification?: QueryKeyModificator;
    value: string | string[] | boolean | number;
}
