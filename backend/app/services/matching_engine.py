"""
Fuzzy Matching Engine for Hebrew Names
Matches bank transaction payer names to tenant names using multiple strategies.
"""

from typing import List, Dict, Optional, Tuple
from rapidfuzz import fuzz, process
import re


class NameMatchingEngine:
    """
    Fuzzy matching engine for Hebrew names.
    Handles name reversals, abbreviations, and Hebrew-specific quirks.
    """

    def __init__(self, confidence_threshold: float = 0.7):
        """
        Args:
            confidence_threshold: Minimum confidence score (0-1) for a match
        """
        self.confidence_threshold = confidence_threshold

    def match_transaction_to_tenants(
        self,
        payer_name: str,
        tenants: List[Dict],
        expected_amount: Optional[float] = None,
        actual_amount: Optional[float] = None
    ) -> Tuple[Optional[str], float, str]:
        """
        Match a payer name from bank to a tenant.

        Args:
            payer_name: Name from bank transaction
            tenants: List of tenant dicts with 'id', 'name', 'full_name'
            expected_amount: Expected payment amount
            actual_amount: Actual payment amount

        Returns:
            Tuple of (tenant_id, confidence_score, match_method)
        """
        if not payer_name or not tenants:
            return None, 0.0, 'none'

        # Normalize the payer name
        normalized_payer = self._normalize_name(payer_name)

        best_match = None
        best_score = 0.0
        best_method = 'none'

        for tenant in tenants:
            tenant_id = str(tenant['id'])
            tenant_name = tenant.get('name', '')
            tenant_full_name = tenant.get('full_name', tenant_name)

            # Try multiple matching strategies
            strategies = [
                ('exact', self._exact_match),
                ('reversed_name', self._reversed_name_match),
                ('fuzzy', self._fuzzy_match),
                ('token_based', self._token_based_match),
            ]

            for method, matcher in strategies:
                score = matcher(normalized_payer, tenant_name, tenant_full_name)
                if score > best_score:
                    best_score = score
                    best_match = tenant_id
                    best_method = method

        # Try amount matching if applicable
        if expected_amount and actual_amount:
            if abs(expected_amount - actual_amount) < 1.0:  # Within 1 shekel
                # Boost confidence if amounts match
                best_score = min(best_score + 0.2, 1.0)
                if best_method == 'none':
                    best_method = 'amount'

        # Only return match if above threshold
        if best_score >= self.confidence_threshold:
            return best_match, best_score, best_method

        return None, best_score, best_method

    def _normalize_name(self, name: str) -> str:
        """Normalize Hebrew name for comparison"""
        if not name:
            return ''

        # Remove extra whitespace
        name = ' '.join(name.split())

        # Convert to lowercase (works for Hebrew too)
        name = name.lower()

        # Remove common punctuation
        name = re.sub(r'[.,\'"״״]', '', name)

        # Normalize Hebrew final letters (if needed)
        # ך -> כ, ם -> מ, ן -> נ, ף -> פ, ץ -> צ
        final_to_normal = {
            'ך': 'כ',
            'ם': 'מ',
            'ן': 'נ',
            'ף': 'פ',
            'ץ': 'צ'
        }
        for final, normal in final_to_normal.items():
            name = name.replace(final, normal)

        return name.strip()

    def _exact_match(
        self,
        payer_name: str,
        tenant_name: str,
        tenant_full_name: str
    ) -> float:
        """Exact string match"""
        normalized_tenant = self._normalize_name(tenant_name)
        normalized_full = self._normalize_name(tenant_full_name)

        if payer_name == normalized_tenant or payer_name == normalized_full:
            return 1.0

        return 0.0

    def _reversed_name_match(
        self,
        payer_name: str,
        tenant_name: str,
        tenant_full_name: str
    ) -> float:
        """
        Match with name parts reversed.
        Example: "מן גיא" matches "גיא מ"
        """
        payer_parts = payer_name.split()
        tenant_parts = self._normalize_name(tenant_name).split()
        full_parts = self._normalize_name(tenant_full_name).split()

        # Try reversing payer name
        if len(payer_parts) >= 2:
            reversed_payer = ' '.join(reversed(payer_parts))

            # Check against tenant name
            if reversed_payer == self._normalize_name(tenant_name):
                return 0.95

            # Check if reversed matches start of full name
            tenant_str = self._normalize_name(tenant_name)
            full_str = self._normalize_name(tenant_full_name)

            if reversed_payer.startswith(tenant_str) or tenant_str.startswith(reversed_payer):
                return 0.85

            if reversed_payer.startswith(full_str) or full_str.startswith(reversed_payer):
                return 0.85

        # Try reversing tenant name
        if len(tenant_parts) >= 2:
            reversed_tenant = ' '.join(reversed(tenant_parts))
            if payer_name == reversed_tenant:
                return 0.95

        return 0.0

    def _fuzzy_match(
        self,
        payer_name: str,
        tenant_name: str,
        tenant_full_name: str
    ) -> float:
        """Fuzzy string matching using rapidfuzz"""
        # Try matching against both tenant name and full name
        score_name = fuzz.ratio(payer_name, self._normalize_name(tenant_name)) / 100.0
        score_full = fuzz.ratio(payer_name, self._normalize_name(tenant_full_name)) / 100.0

        # Use the better score
        best_score = max(score_name, score_full)

        # Also try partial ratio (substring matching)
        partial_name = fuzz.partial_ratio(payer_name, self._normalize_name(tenant_name)) / 100.0
        partial_full = fuzz.partial_ratio(payer_name, self._normalize_name(tenant_full_name)) / 100.0

        partial_score = max(partial_name, partial_full)

        # Weight full match higher than partial
        final_score = (best_score * 0.7 + partial_score * 0.3)

        return final_score

    def _token_based_match(
        self,
        payer_name: str,
        tenant_name: str,
        tenant_full_name: str
    ) -> float:
        """
        Token-based matching (word-by-word).
        Good for abbreviated names.
        """
        payer_tokens = set(payer_name.split())
        tenant_tokens = set(self._normalize_name(tenant_name).split())
        full_tokens = set(self._normalize_name(tenant_full_name).split())

        # Calculate Jaccard similarity
        def jaccard(set1, set2):
            if not set1 or not set2:
                return 0.0
            intersection = len(set1.intersection(set2))
            union = len(set1.union(set2))
            return intersection / union if union > 0 else 0.0

        score_tenant = jaccard(payer_tokens, tenant_tokens)
        score_full = jaccard(payer_tokens, full_tokens)

        best_score = max(score_tenant, score_full)

        # Boost score if first token matches (first name or last name)
        if payer_tokens and tenant_tokens:
            payer_first = list(payer_tokens)[0]
            if payer_first in tenant_tokens or payer_first in full_tokens:
                best_score = min(best_score + 0.15, 1.0)

        return best_score

    def find_unmatched_transactions(
        self,
        transactions: List[Dict],
        matched_tenant_ids: List[str]
    ) -> List[Dict]:
        """Return transactions that haven't been matched"""
        return [
            t for t in transactions
            if t.get('matched_tenant_id') not in matched_tenant_ids
        ]

    def suggest_matches(
        self,
        payer_name: str,
        tenants: List[Dict],
        top_n: int = 3
    ) -> List[Tuple[str, float, str]]:
        """
        Get top N suggested matches for manual review.

        Returns:
            List of (tenant_id, confidence, tenant_name) tuples
        """
        suggestions = []

        for tenant in tenants:
            tenant_id = str(tenant['id'])
            tenant_name = tenant.get('name', '')
            tenant_full_name = tenant.get('full_name', tenant_name)

            # Get best match score
            _, score, method = self.match_transaction_to_tenants(
                payer_name,
                [tenant],
                None,
                None
            )

            if score > 0:
                suggestions.append((tenant_id, score, tenant_name, method))

        # Sort by confidence (descending)
        suggestions.sort(key=lambda x: x[1], reverse=True)

        return suggestions[:top_n]
