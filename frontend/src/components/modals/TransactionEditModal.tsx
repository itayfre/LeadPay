import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statementsAPI } from '../../services/api';
import type { SplitAllocationError, TransactionPatchPayload } from '../../types';

interface Props {
  transaction: {
    id: string;
    date: string;        // yyyy-mm-dd
    description: string;
    amount: number;      // signed: positive = credit, negative = debit
  };
  tenantId: string;
  buildingId: string;
  onClose: () => void;
  onOpenAllocationEditor: (txId: string) => void;
}

export default function TransactionEditModal({
  transaction,
  tenantId,
  buildingId,
  onClose,
  onOpenAllocationEditor,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
  });
  const [splitError, setSplitError] = useState<SplitAllocationError | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: TransactionPatchPayload = {};
      if (form.date !== transaction.date) payload.activity_date = form.date;
      if (form.description !== transaction.description) payload.description = form.description;
      if (form.amount !== transaction.amount) {
        // Preserve credit vs debit by which one was originally set
        if (transaction.amount >= 0) payload.credit_amount = form.amount;
        else payload.debit_amount = Math.abs(form.amount);
      }
      await statementsAPI.patchTransaction(transaction.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantHistory', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
      onClose();
    },
    onError: (err: unknown) => {
      if (
        err && typeof err === 'object' && 'code' in err &&
        (err as SplitAllocationError).code === 'split_allocation_requires_resplit'
      ) {
        setSplitError(err as SplitAllocationError);
      }
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="font-bold text-gray-900">{t('transaction.edit.title')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {splitError && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-sm">
              <p className="font-bold text-yellow-900 mb-2">
                ⚠️ {t('transaction.edit.splitError.title')}
              </p>
              <p className="text-yellow-800 whitespace-pre-line">
                {t('transaction.edit.splitError.body', { count: splitError.allocation_count })}
              </p>
              <button
                onClick={() => onOpenAllocationEditor(transaction.id)}
                className="mt-3 px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-xs"
              >
                {t('transaction.edit.splitError.cta')}
              </button>
            </div>
          )}

          <label className="block text-sm">
            <span className="text-gray-700">{t('transaction.edit.fields.date')}</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t('transaction.edit.fields.desc')}</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t('transaction.edit.fields.amount')}</span>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => { setSplitError(null); mutation.mutate(); }}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
