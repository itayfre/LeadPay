import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statementsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../modals/ConfirmDialog';
import type { RecentUpload } from '../../types';

interface Props {
  buildingId: string;
  onEdit: (statementId: string) => void;
}

const INITIAL_LIMIT = 5;

export default function RecentUploadsList({ buildingId, onEdit }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RecentUpload | null>(null);

  const canDelete = user?.role === 'manager';

  const { data, isLoading } = useQuery({
    queryKey: ['statements', buildingId],
    queryFn: () => statementsAPI.listForBuilding(buildingId),
  });

  const deleteMutation = useMutation({
    mutationFn: (statementId: string) => statementsAPI.delete(statementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements', buildingId] });
      queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
      setPendingDelete(null);
    },
  });

  if (isLoading) {
    return <div className="text-center text-gray-400 py-6">...</div>;
  }

  const all = data?.statements ?? [];
  if (all.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-400">
        {t('upload.recentUploads.empty')}
      </div>
    );
  }

  const shown = expanded ? all : all.slice(0, INITIAL_LIMIT);
  const remaining = all.length - shown.length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <h3 className="font-bold text-gray-900 px-6 py-4 border-b border-gray-200">
        {t('upload.recentUploads.title')}
      </h3>
      <ul className="divide-y divide-gray-100">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded">
                {s.period}
              </span>
              <span className="text-sm text-gray-500">
                {new Date(s.upload_date).toLocaleDateString('he-IL')}
              </span>
              <span className="text-sm text-gray-400 truncate">{s.filename}</span>
              <span className="text-xs text-gray-500">
                {t('upload.recentUploads.transactions', { count: s.transaction_count })}
              </span>
              {s.unmatched_count > 0 ? (
                <button
                  onClick={() => onEdit(s.id)}
                  className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                >
                  ⚠ {t('upload.recentUploads.unmatched', { count: s.unmatched_count })}
                </button>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                  ✓ {t('upload.recentUploads.matched', { count: s.matched_count })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(s.id)}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                title={t('common.edit')}
              >
                ✏️
              </button>
              {canDelete && (
                <button
                  onClick={() => setPendingDelete(s)}
                  className="p-2 rounded hover:bg-red-50 text-red-600"
                  title={t('common.delete')}
                >
                  🗑️
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-3 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100"
        >
          {t('upload.recentUploads.showMore', { count: remaining })}
        </button>
      )}
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={
          pendingDelete
            ? t('upload.delete.confirmTitle', { filename: pendingDelete.filename })
            : ''
        }
        message={
          pendingDelete
            ? t('upload.delete.confirmBody', { count: pendingDelete.transaction_count })
            : ''
        }
        confirmText={t('common.delete')}
        type="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
