use super::codes::ERROR_CODES;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorLookupResult {
    pub code_hex: String,
    pub code_decimal: String,
    pub description: String,
    pub category: String,
    pub found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorSearchResult {
    pub code_hex: String,
    pub code_decimal: String,
    pub description: String,
    pub category: String,
    pub found: bool,
}

/// Try to parse an input string as an error code (hex or decimal).
/// Accepts formats: "0x80070005", "80070005", "-2147024891", "2147942405"
fn try_parse_error_code(input: &str) -> Option<u32> {
    if input.starts_with("0x") || input.starts_with("0X") {
        u32::from_str_radix(&input[2..], 16).ok()
    } else if input.starts_with('-') {
        // Negative decimal (signed representation of HRESULT)
        input.parse::<i32>().ok().map(|v| v as u32)
    } else if let Ok(hex_val) = u32::from_str_radix(input, 16) {
        // Try as raw hex without prefix (if it looks like hex)
        if input.len() >= 6 && input.chars().all(|c| c.is_ascii_hexdigit()) {
            Some(hex_val)
        } else {
            // Try as decimal first
            input.parse::<u32>().ok().or(Some(hex_val))
        }
    } else {
        input.parse::<u32>().ok()
    }
}

/// Look up an error code by its hex or decimal value.
/// Accepts formats: "0x80070005", "80070005", "-2147024891", "2147942405"
pub fn lookup_error_code(input: &str) -> ErrorLookupResult {
    let input = input.trim();

    match try_parse_error_code(input) {
        Some(c) => {
            if let Some(ec) = ERROR_CODES.iter().find(|ec| ec.code == c) {
                ErrorLookupResult {
                    code_hex: format!("0x{:08X}", c),
                    code_decimal: format!("{}", c as i32),
                    description: ec.description.to_string(),
                    category: ec.category.label().to_string(),
                    found: true,
                }
            } else {
                // Code not in database — still show the formatted values
                ErrorLookupResult {
                    code_hex: format!("0x{:08X}", c),
                    code_decimal: format!("{}", c as i32),
                    description: "Unknown error code".to_string(),
                    category: String::new(),
                    found: false,
                }
            }
        }
        None => ErrorLookupResult {
            code_hex: String::new(),
            code_decimal: String::new(),
            description: "Invalid error code format".to_string(),
            category: String::new(),
            found: false,
        },
    }
}

/// Search error codes by exact hex/decimal match or by description substring.
/// Returns up to 50 results sorted by relevance.
pub fn search_error_codes(query: &str) -> Vec<ErrorSearchResult> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }

    // Try exact code lookup first
    if let Some(code_val) = try_parse_error_code(query) {
        if let Some(ec) = ERROR_CODES.iter().find(|ec| ec.code == code_val) {
            return vec![ErrorSearchResult {
                code_hex: format!("0x{:08X}", ec.code),
                code_decimal: format!("{}", ec.code as i32),
                description: ec.description.to_string(),
                category: ec.category.label().to_string(),
                found: true,
            }];
        }
        // Known code format but not in DB
        return vec![ErrorSearchResult {
            code_hex: format!("0x{:08X}", code_val),
            code_decimal: format!("{}", code_val as i32),
            description: "Unknown error code".to_string(),
            category: String::new(),
            found: false,
        }];
    }

    // Substring search across descriptions
    let query_lower = query.to_lowercase();
    let mut results: Vec<(usize, &super::codes::ErrorCode)> = ERROR_CODES
        .iter()
        .filter_map(|ec| {
            let desc_lower = ec.description.to_lowercase();
            if desc_lower.starts_with(&query_lower) {
                Some((0, ec))
            } else if desc_lower.contains(&query_lower) {
                Some((1, ec))
            } else {
                None
            }
        })
        .collect();

    results.sort_by_key(|(priority, _)| *priority);
    results.truncate(50);

    results
        .into_iter()
        .map(|(_, ec)| ErrorSearchResult {
            code_hex: format!("0x{:08X}", ec.code),
            code_decimal: format!("{}", ec.code as i32),
            description: ec.description.to_string(),
            category: ec.category.label().to_string(),
            found: true,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lookup_hex_prefix() {
        let result = lookup_error_code("0x80070005");
        assert!(result.found);
        assert!(result.description.contains("Access is denied"));
    }

    #[test]
    fn test_lookup_hex_no_prefix() {
        let result = lookup_error_code("80070005");
        assert!(result.found);
        assert!(result.description.contains("Access is denied"));
    }

    #[test]
    fn test_lookup_negative_decimal() {
        // 0x80070005 = -2147024891 as signed i32
        let result = lookup_error_code("-2147024891");
        assert!(result.found);
        assert!(result.description.contains("Access is denied"));
    }

    #[test]
    fn test_lookup_success_code() {
        let result = lookup_error_code("0x00000000");
        assert!(result.found);
        assert!(result.description.contains("S_OK"));
    }

    #[test]
    fn test_lookup_unknown() {
        let result = lookup_error_code("0xDEADBEEF");
        assert!(!result.found);
        assert_eq!(result.code_hex, "0xDEADBEEF");
    }

    #[test]
    fn test_error_codes_have_categories() {
        use super::super::codes::{ERROR_CODES, ErrorCategory};
        let intune_count = ERROR_CODES
            .iter()
            .filter(|ec| matches!(ec.category, ErrorCategory::Intune))
            .count();
        assert!(intune_count > 0, "Should have Intune-categorized codes");
    }

    #[test]
    fn test_no_duplicate_error_codes() {
        use super::super::codes::ERROR_CODES;
        use std::collections::HashSet;
        let mut seen = HashSet::new();
        for ec in ERROR_CODES.iter() {
            assert!(
                seen.insert(ec.code),
                "Duplicate error code: 0x{:08X}",
                ec.code
            );
        }
    }

    #[test]
    fn test_lookup_includes_category() {
        let result = lookup_error_code("0x87D00215");
        assert!(result.found);
        assert_eq!(result.category, "Intune");
    }

    #[test]
    fn test_search_exact_hex() {
        let results = search_error_codes("0x80070005");
        assert_eq!(results.len(), 1);
        assert!(results[0].found);
        assert!(results[0].description.contains("Access is denied"));
        assert_eq!(results[0].category, "Windows");
    }

    #[test]
    fn test_search_by_description() {
        let results = search_error_codes("Access is denied");
        assert!(!results.is_empty());
        assert!(results
            .iter()
            .any(|r| r.description.contains("Access is denied")));
    }

    #[test]
    fn test_search_empty_query() {
        let results = search_error_codes("");
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_no_match() {
        let results = search_error_codes("xyznonexistentxyz");
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_max_results() {
        let results = search_error_codes("error");
        assert!(results.len() <= 50, "Should cap at 50 results");
    }
}
