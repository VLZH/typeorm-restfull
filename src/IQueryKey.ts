// Filter query key
export type QueryKeyModificator =
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "not_in"
    | "not";
export const QueryKeyModificatorsList: QueryKeyModificator[] = [
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "not"
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
