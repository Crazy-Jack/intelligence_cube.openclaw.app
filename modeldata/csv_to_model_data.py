#!/usr/bin/env python3
"""
CSV to Model Data Converter
Converts model-data.csv to model-data.js format

Usage: python csv_to_model_data.py
"""

import csv
import json
import os
import random
from pathlib import Path
from typing import Optional, List

# Paths
SCRIPT_DIR = Path(__file__).parent
CSV_PATH = SCRIPT_DIR / "model-data-clean.csv"
OUTPUT_PATH = SCRIPT_DIR.parent / "model-data-generated.js"

# Rating text to numeric value mapping
RATING_MAP = {
    "excellent": 5.0,
    "good": 4.0,
    "average": 3.0,
    "fair": 2.0,
    "poor": 1.0,
}


def parse_percentage(value: str) -> float:
    """Parse percentage string to number (e.g., '98.00%' -> 98.0)"""
    if not value:
        return 0.0
    cleaned = value.replace("%", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_change(value: str) -> float:
    """Parse change value (e.g., '7.20%' -> 7.2 or '-0.50%' -> -0.5)"""
    if not value:
        return 0.0
    cleaned = value.replace("%", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_number(value: str) -> float:
    """Parse numeric string to number"""
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def parse_rating(value: str) -> float:
    """Get rating number from text or numeric value"""
    if not value:
        return 3.0

    # Check if it's a text rating
    lower_value = value.lower().strip()
    if lower_value in RATING_MAP:
        return RATING_MAP[lower_value]

    # Try to parse as number
    try:
        return float(value)
    except ValueError:
        return 3.0


def generate_stars_html(rating: float) -> str:
    """Generate stars HTML from rating"""
    full_stars = int(rating)
    has_half_star = (rating - full_stars) >= 0.5
    stars = "★" * full_stars
    if has_half_star and full_stars < 5:
        stars += "☆"
    stars += "☆" * max(0, 5 - full_stars - (1 if has_half_star else 0))
    return stars


def generate_usage(share_price: float, total_score: float) -> int:
    """Generate a usage value based on sharePrice and totalScore"""
    base = int(share_price * 10 + total_score * 5)
    variance = random.randint(0, 500)
    return max(50, base + variance)


def clean_model_name(name: str, paper_title: str = "") -> Optional[str]:
    """Clean and validate model name, filtering out paper titles used as model names"""
    if not name:
        return None
    name = name.strip()
    
    # Skip empty, NA, or Unnamed entries
    if name in ("", "NA") or name.startswith("Unnamed"):
        return None
    
    # Skip entries that say "Cannot find model"
    if "cannot find" in name.lower():
        return None
    
    word_count = len(name.split())
    
    # Check if it looks like a proper model name format
    # (contains hyphens, underscores, or is short with capitals)
    has_model_format = (
        "-" in name or 
        "_" in name or 
        word_count <= 4 or
        any(c.isupper() for c in name[1:])  # CamelCase check
    )
    
    # If model name matches paper title exactly and doesn't look like a model name format
    if paper_title and name.lower() == paper_title.lower().strip():
        if not has_model_format:
            return None
    
    # Skip if model name is too long (likely a paper title sentence)
    if word_count > 10:
        return None
    
    # Skip if it starts with common paper title patterns AND is long
    paper_title_starts = [
        "a ", "an ", "the ", "on ", "towards ", "toward ", 
        "understanding ", "learning ", "comparison of ",
        "large-scale ", "long-term ", "efficient ",
    ]
    name_lower = name.lower()
    for pattern in paper_title_starts:
        if name_lower.startswith(pattern) and word_count > 5:
            return None
    
    return name


def get_column_index(headers: List[str], names: List[str]) -> int:
    """Find column index by trying multiple possible header names"""
    headers_lower = [h.lower().strip() for h in headers]
    for name in names:
        try:
            return headers_lower.index(name.lower())
        except ValueError:
            continue
    return -1


def convert_csv_to_model_data():
    """Main conversion function"""
    print(f"Reading CSV file: {CSV_PATH}")

    if not CSV_PATH.exists():
        print(f"Error: CSV file not found: {CSV_PATH}")
        return

    model_data = {}
    processed = 0
    skipped = 0

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        headers = next(reader)

        print(f"CSV Headers: {headers}")

        # Column mappings
        model_name_idx = get_column_index(headers, ["model_name", "model name"])
        paper_title_idx = get_column_index(headers, ["paper_title", "paper title", "papertitle"])
        paper_url_idx = get_column_index(headers, ["paper url", "paperurl", "paper_url"])
        purpose_idx = get_column_index(headers, ["purpose"])
        hidden_purpose_idx = get_column_index(headers, ["hidden purpose", "hiddenpurpose", "hidden_purpose"])
        use_case_idx = get_column_index(headers, ["use case", "usecase", "use_case"])
        hidden_use_case_idx = get_column_index(headers, ["hidden use case", "hiddenusecase", "hidden_use_case"])
        industry_idx = get_column_index(headers, ["industry"])
        category_idx = get_column_index(headers, ["category"])
        purchased_percent_idx = get_column_index(headers, ["purchased percentage", "purchasedpercentage", "purchased_percentage"])
        token_price_idx = get_column_index(headers, ["token price (per 1k tokens)", "token price", "tokenprice", "token_price"])
        share_price_idx = get_column_index(headers, ["share price (price per share)", "share price", "shareprice", "share_price"])
        change_idx = get_column_index(headers, ["change"])
        rating_idx = get_column_index(headers, ["rating formatted", "ratingformatted", "rating_formatted", "rating"])
        stars_html_idx = get_column_index(headers, ["stars html", "starshtml", "stars_html"])
        compatibility_idx = get_column_index(headers, ["compatibility"])
        total_score_idx = get_column_index(headers, ["totalscore", "total score", "total_score"])

        print(f"\nColumn indices found:")
        print(f"  model_name: {model_name_idx}")
        print(f"  paper url: {paper_url_idx}")
        print(f"  purpose: {purpose_idx}")
        print(f"  category: {category_idx}")
        print(f"  industry: {industry_idx}")

        if model_name_idx == -1:
            print("Error: Could not find model_name column in CSV")
            return

        # Process rows
        for row in reader:
            if len(row) <= model_name_idx:
                skipped += 1
                continue

            # Helper to safely get row value
            def get_val(idx: int, default: str = "") -> str:
                if idx == -1 or idx >= len(row):
                    return default
                return row[idx]

            # Get paper title to compare with model name
            paper_title = get_val(paper_title_idx)
            model_name = clean_model_name(row[model_name_idx], paper_title)
            if not model_name:
                skipped += 1
                continue

            # Parse values
            share_price = parse_number(get_val(share_price_idx))
            total_score = parse_number(get_val(total_score_idx))
            rating_text = get_val(rating_idx)
            rating = parse_rating(rating_text)
            stars_html = get_val(stars_html_idx)

            # Build model entry
            entry = {
                "purpose": get_val(purpose_idx),
                "hiddenPurpose": get_val(hidden_purpose_idx),
                "useCase": get_val(use_case_idx),
                "hiddenUseCase": get_val(hidden_use_case_idx),
                "category": get_val(category_idx) or "AI Research",
                "industry": get_val(industry_idx) or "AI Research",
                "purchasedPercent": parse_percentage(get_val(purchased_percent_idx)),
                "tokenPrice": parse_number(get_val(token_price_idx)),
                "sharePrice": share_price,
                "change": parse_change(get_val(change_idx)),
                "rating": rating,
                "ratingFormatted": f"{rating:.1f}",
                "starsHtml": stars_html if stars_html else generate_stars_html(rating),
                "usage": generate_usage(share_price, total_score),
                "compatibility": parse_percentage(get_val(compatibility_idx)) / 10,  # Convert to 0-10 scale
                "totalScore": int(total_score),
                "paperLink": get_val(paper_url_idx),
            }

            model_data[model_name] = entry
            processed += 1

    print(f"\nProcessed: {processed} models")
    print(f"Skipped: {skipped} rows (empty or invalid model names)")

    # Generate output JavaScript
    from datetime import datetime

    json_data = json.dumps(model_data, indent=4, ensure_ascii=False)

    output = f"""// 🌟 完整模型数据库 - 包含所有模型
// Generated from modeldata/model-data.csv
// Generated on {datetime.now().isoformat()}

const MODEL_DATA = {json_data};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {{
    module.exports = {{ MODEL_DATA }};
}}
"""

    # Write output file
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"\nOutput written to: {OUTPUT_PATH}")
    print(f"Total models: {len(model_data)}")

    # Show sample entry
    if model_data:
        sample_key = next(iter(model_data))
        print(f'\nSample entry:')
        print(f'"{sample_key}": {json.dumps(model_data[sample_key], indent=2, ensure_ascii=False)[:500]}...')


if __name__ == "__main__":
    convert_csv_to_model_data()
