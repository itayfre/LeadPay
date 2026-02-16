"""
Bank Statement Excel Parser
Parses Hebrew bank statement Excel files and extracts transactions.
"""

import pandas as pd
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import re


class BankStatementParser:
    """Parser for Israeli bank statement Excel files"""

    # Common bank names to identify and remove from descriptions
    BANK_NAMES = [
        'הפועלים', 'לאומי', 'דיסקונט', 'מזרחי', 'בינלאומי',
        'פועלים', 'איגוד', 'מרכנתיל', 'יהב', 'אוצר החייל',
        'בנק', 'Bank'
    ]

    # Fee/expense keywords to filter out
    FEE_KEYWORDS = [
        'מע"מ', 'עמלה', 'עמלת', 'דמי ניהול', 'ניהול חשבון',
        'קנס', 'אגרה', 'בנקאות', 'סה"כ פעולות', 'סה"כ'
    ]

    def __init__(self):
        self.column_mappings = {
            # Hebrew column names to English
            'תאריך פעילות': 'activity_date',
            'תאריך תמצית': 'statement_date',
            'אסמכתא': 'reference',
            'תאור פעולה': 'description',
            'זכות': 'credit',
            'חובה': 'debit',
            'יתרה': 'balance'
        }

    def parse_excel(
        self,
        file_content: bytes,
        filename: str
    ) -> Tuple[List[Dict], Dict]:
        """
        Parse bank statement Excel file

        Args:
            file_content: Binary content of Excel file
            filename: Original filename

        Returns:
            Tuple of (transactions list, metadata dict)
        """
        # Read Excel file
        df = pd.read_excel(file_content, engine='openpyxl')

        # Normalize column names
        df = self._normalize_columns(df)

        # Extract metadata
        metadata = self._extract_metadata(df, filename)

        # Parse transactions
        transactions = self._parse_transactions(df)

        # Filter out fees and summary rows
        transactions = self._filter_transactions(transactions)

        return transactions, metadata

    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize Hebrew column names to English"""
        # Create a mapping of actual columns to standard names
        column_map = {}
        for col in df.columns:
            col_str = str(col).strip()
            if col_str in self.column_mappings:
                column_map[col] = self.column_mappings[col_str]

        # Rename columns
        df = df.rename(columns=column_map)

        return df

    def _extract_metadata(
        self,
        df: pd.DataFrame,
        filename: str
    ) -> Dict:
        """Extract statement metadata (period, account, etc.)"""
        metadata = {
            'filename': filename,
            'row_count': len(df),
            'period_month': None,
            'period_year': None
        }

        # Try to extract period from dates
        if 'activity_date' in df.columns:
            valid_dates = df['activity_date'].dropna()
            if len(valid_dates) > 0:
                # Get the most common month/year
                if isinstance(valid_dates.iloc[0], str):
                    # Parse date strings
                    dates = pd.to_datetime(valid_dates, format='%d/%m/%y', errors='coerce')
                else:
                    dates = valid_dates

                dates = dates.dropna()
                if len(dates) > 0:
                    # Use the latest date for period
                    latest_date = dates.max()
                    metadata['period_month'] = latest_date.month
                    metadata['period_year'] = latest_date.year

        return metadata

    def _parse_transactions(self, df: pd.DataFrame) -> List[Dict]:
        """Parse individual transactions from dataframe"""
        transactions = []

        for idx, row in df.iterrows():
            # Skip rows without description
            if pd.isna(row.get('description')):
                continue

            description = str(row['description']).strip()

            # Skip empty descriptions
            if not description:
                continue

            # Parse date
            activity_date = self._parse_date(row.get('activity_date'))
            if not activity_date:
                continue

            # Extract amounts
            credit = self._parse_amount(row.get('credit'))
            debit = self._parse_amount(row.get('debit'))
            balance = self._parse_amount(row.get('balance'))

            # Extract payer name from description
            payer_name = self._extract_payer_name(description)

            transaction = {
                'activity_date': activity_date,
                'reference_number': str(row.get('reference', '')),
                'description': description,
                'payer_name': payer_name,
                'credit_amount': credit,
                'debit_amount': debit,
                'balance': balance,
                'transaction_type': self._classify_transaction(description, credit, debit)
            }

            transactions.append(transaction)

        return transactions

    def _parse_date(self, date_value) -> Optional[datetime]:
        """Parse date from various formats"""
        if pd.isna(date_value):
            return None

        # If already datetime
        if isinstance(date_value, datetime):
            return date_value

        # If string, try to parse
        if isinstance(date_value, str):
            # Common Israeli format: DD/MM/YY or DD/MM/YYYY
            try:
                return pd.to_datetime(date_value, format='%d/%m/%y')
            except:
                try:
                    return pd.to_datetime(date_value, format='%d/%m/%Y')
                except:
                    return None

        return None

    def _parse_amount(self, value) -> Optional[float]:
        """Parse amount from string or number"""
        if pd.isna(value):
            return None

        if isinstance(value, (int, float)):
            return float(value)

        # If string, remove commas and parse
        if isinstance(value, str):
            cleaned = value.replace(',', '').strip()
            try:
                return float(cleaned)
            except:
                return None

        return None

    def _extract_payer_name(self, description: str) -> Optional[str]:
        """
        Extract payer name from transaction description.
        Format: "[bank name]    -  [payer name]"
        """
        # Remove extra whitespace
        description = ' '.join(description.split())

        # Look for pattern: bank name - payer name
        # Try to find the separator
        if ' - ' in description or '-' in description:
            parts = re.split(r'\s*-\s*', description, maxsplit=1)
            if len(parts) == 2:
                bank_part, name_part = parts
                # Clean the name part
                name = name_part.strip()
                return name if name else None

        # If no separator, try to remove known bank names
        cleaned = description
        for bank in self.BANK_NAMES:
            cleaned = cleaned.replace(bank, '').strip()

        return cleaned if cleaned != description else None

    def _classify_transaction(
        self,
        description: str,
        credit: Optional[float],
        debit: Optional[float]
    ) -> str:
        """Classify transaction type"""
        description_lower = description.lower()

        # Check for fees
        for keyword in self.FEE_KEYWORDS:
            if keyword in description:
                return 'fee'

        # If debit (outgoing), it's a transfer/expense
        if debit and debit > 0:
            return 'transfer'

        # If credit (incoming), likely a payment
        if credit and credit > 0:
            return 'payment'

        return 'other'

    def _filter_transactions(self, transactions: List[Dict]) -> List[Dict]:
        """Filter out non-payment transactions"""
        filtered = []

        for trans in transactions:
            # Skip fees
            if trans['transaction_type'] == 'fee':
                continue

            # Skip summary rows
            if any(keyword in trans['description'] for keyword in ['סה"כ', 'סיכום', 'סה״כ']):
                continue

            # Skip transfers (outgoing payments)
            if trans['transaction_type'] == 'transfer':
                continue

            filtered.append(trans)

        return filtered
