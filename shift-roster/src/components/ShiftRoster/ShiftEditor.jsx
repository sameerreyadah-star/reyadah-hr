import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../ui/Card';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import { X, Check, Trash2, Clock, User, Calendar } from 'lucide-react';
import { formatDate } from '../../lib/utils';

export default function ShiftEditor({ cell, shifts, employees, onAssign, onDelete, onClose }) {
  const { addToast } = useToast();
  const [selectedShift, setSelectedShift] = useState(cell.existingAssignment?.shiftId || '');
  const [notes, setNotes] = useState(cell.existingAssignment?.notes || '');

  const employee = employees.find(e => e.id === cell.employeeId);
  const dateObj = new Date(cell.date);
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

  const handleAssign = () => {
    if (!selectedShift) {
      addToast('Please select a shift', 'error');
      return;
    }
    onAssign({
      employeeId: cell.employeeId,
      date: cell.date,
      shiftId: selectedShift,
      notes,
    });
  };

  const handleDelete = () => {
    if (cell.existingAssignment) {
      onDelete(cell.existingAssignment.id);
      onClose();
    }
  };

  const getShiftTypeStyle = (shiftId) => {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return {};
    return {
      backgroundColor: shift.color + '15',
      borderColor: shift.color,
      color: shift.color,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <Card className="w-full max-w-lg mx-4 animate-slide-in-up" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Shift Editor</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Assign or modify shift for employee</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Employee Info */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-lg font-semibold">
              {employee?.name?.charAt(0) || '?'}
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">{employee?.name || 'Unknown'}</h4>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {employee?.id || ''}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(cell.date, 'MMM dd, yyyy')}
                </span>
                <span className="text-gray-400">({dayName})</span>
              </div>
            </div>
          </div>

          {/* Shift Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Shift</label>
            <div className="grid grid-cols-2 gap-2">
              {shifts.map(shift => (
                <button
                  key={shift.id}
                  onClick={() => setSelectedShift(shift.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                    selectedShift === shift.id
                      ? 'border-primary bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: shift.color }} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{shift.name}</p>
                      <p className="text-xs text-gray-500">{shift.startTime} - {shift.endTime}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Currently Assigned */}
          {cell.existingAssignment && (
            <div
              className="p-3 rounded-xl border"
              style={getShiftTypeStyle(cell.existingAssignment.shiftId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">Currently Assigned</span>
                </div>
                <Button variant="danger" size="sm" onClick={handleDelete} icon={<Trash2 className="h-3.5 w-3.5" />}>
                  Remove
                </Button>
              </div>
              <p className="text-sm mt-1">
                {shifts.find(s => s.id === cell.existingAssignment.shiftId)?.name || 'Unknown Shift'}
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this assignment..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </CardContent>

        <CardFooter className="justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            icon={<Check className="h-4 w-4" />}
            disabled={!selectedShift}
          >
            {cell.existingAssignment ? 'Update Assignment' : 'Assign Shift'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}