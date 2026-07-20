import { useState, useEffect, useCallback } from 'react';
import { fetchEmployees, fetchAssignments, saveAssignment, saveRoster } from '../services/api';
import { useToast } from '../components/ui/Toast';

export function useShiftRoster() {
  const { addToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const defaultShifts = [
    { id: 'SHIFT001', name: 'Morning Shift', code: 'MORN', startTime: '06:00', endTime: '14:00', color: '#3B82F6' },
    { id: 'SHIFT002', name: 'Evening Shift', code: 'EVEN', startTime: '14:00', endTime: '22:00', color: '#8B5CF6' },
    { id: 'SHIFT003', name: 'Night Shift', code: 'NIGHT', startTime: '22:00', endTime: '06:00', color: '#1F2937' },
    { id: 'SHIFT004', name: 'General Shift', code: 'GEN', startTime: '09:00', endTime: '18:00', color: '#2563EB' },
  ];

  const loadData = useCallback(async (month, year) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('reyadahToken');
      if (!token) {
        setError('Please log in to the HR portal first, then refresh this page.');
        setLoading(false);
        return;
      }

      const [emps, assigns] = await Promise.all([
        fetchEmployees(),
        fetchAssignments(month, year),
      ]);

      if (!emps || emps.length === 0) {
        setError('No employees found in your system. Add employees from the HR portal first.');
        setEmployees([]);
      } else {
        setEmployees(emps);
      }
      
      setAssignments(assigns || []);
      setShifts(defaultShifts);
      setError(null);
    } catch (err) {
      console.error('Failed to load shift roster data:', err);
      setError('Could not load employee data from server. Make sure you are logged in and try again.');
      setEmployees([]);
      setAssignments([]);
      setShifts(defaultShifts);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAssignShift = async (assignmentData) => {
    const { employeeId, date, shiftId } = assignmentData;

    const duplicate = assignments.find(
      a => a.employeeId === employeeId && a.date === date && a.shiftId === shiftId
    );
    if (duplicate) {
      addToast('Employee already has this shift assigned for this date', 'error');
      return false;
    }

    const shift = shifts.find(s => s.id === shiftId);
    const existingOnDate = assignments.filter(
      a => a.employeeId === employeeId && a.date === date
    );

    for (const existing of existingOnDate) {
      const existingShift = shifts.find(s => s.id === existing.shiftId);
      if (existingShift && shift && isOverlapping(shift.startTime, shift.endTime, existingShift.startTime, existingShift.endTime)) {
        addToast('Shift overlaps with previous assignment', 'error');
        return false;
      }
    }

    try {
      await saveAssignment(employeeId, date, shiftId, assignmentData.notes);
      const newAssignment = {
        id: `ASSIGN${Date.now()}`,
        ...assignmentData,
      };
      // Remove old assignment for same employee+date if exists
      setAssignments(prev => prev.filter(a => !(a.employeeId === employeeId && a.date === date)));
      setAssignments(prev => [...prev, newAssignment]);
      addToast('Shift assigned successfully', 'success');
      return true;
    } catch (err) {
      addToast(err.message || 'Failed to assign shift', 'error');
      return false;
    }
  };

  const handleDeleteAssignment = (assignmentId) => {
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    addToast('Assignment removed', 'info');
  };

  const addShift = (shiftData) => {
    const newShift = {
      ...shiftData,
      id: `SHIFT${String(shifts.length + 1).padStart(3, '0')}`,
    };
    setShifts(prev => [...prev, newShift]);
    addToast('Shift created successfully', 'success');
  };

  return {
    employees,
    assignments,
    shifts,
    loading,
    error,
    loadData,
    handleAssignShift,
    handleDeleteAssignment,
    addShift,
    setAssignments,
  };
}

function isOverlapping(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  const e1Adjusted = e1 < s1 ? e1 + 1440 : e1;
  const e2Adjusted = e2 < s2 ? e2 + 1440 : e2;
  return s1 < e2Adjusted && s2 < e1Adjusted;
}

function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}