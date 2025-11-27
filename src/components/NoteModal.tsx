import React from 'react';
import { X } from 'lucide-react';

interface NoteModalProps {
  isOpen: boolean;
  title?: string;
  note?: string | null;
  onClose: () => void;
}

const NoteModal: React.FC<NoteModalProps> = ({ isOpen, title = 'Not', note, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-4">
          {note && note.length > 0 ? (
            <div className="whitespace-pre-wrap text-sm text-gray-800">{note}</div>
          ) : (
            <div className="text-sm text-gray-500">Bu lokasyon için henüz bir not eklenmemiş.</div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 text-right">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-md">Kapat</button>
        </div>
      </div>
    </div>
  );
};

export default NoteModal;
