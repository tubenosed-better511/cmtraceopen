use crate::error_db::lookup::{
    lookup_error_code as do_lookup, search_error_codes as do_search, ErrorLookupResult,
    ErrorSearchResult,
};

/// Look up an error code and return its description.
#[tauri::command]
pub fn lookup_error_code(code: String) -> ErrorLookupResult {
    do_lookup(&code)
}

/// Search error codes by exact match or description substring.
#[tauri::command]
pub fn search_error_codes(query: String) -> Vec<ErrorSearchResult> {
    do_search(&query)
}
