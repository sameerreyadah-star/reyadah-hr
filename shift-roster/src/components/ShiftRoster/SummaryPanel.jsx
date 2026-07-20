import React from 'react';
import { Card, CardContent } from '../ui/Card';
import { Users, UserCheck, UserX, Clock, Moon, Sun, CalendarDays } from 'lucide-react';

export default function SummaryPanel({ employees, assignments, shifts, currentDate }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const monthAssignments = assignments.filter(a => a.date.startsWith(monthStr));
  const assignedEmployees = new Set(monthAssignments.map(a => a.employeeId));
  
  const morningShifts = monthAssignments.filter(a => {
    const shift = shifts.find(s => s.id === a.shiftId);
    return shift?.name?.toLowerCase().includes('morning');
  }).length;

  const eveningShifts = monthAssignments.filter(a => {
    const shift = shifts.find(s => s.id === a.shiftId);
    return shift?.name?.toLowerCase().includes('evening');
  }).length;

  const nightShifts = monthAssignments.filter(a => {
    const shift = shifts.find(s => s.id === a.shiftId);
    return shift?.name?.toLowerCase().includes('night');
  }).length;

  const stats = [
    {
      label: 'Total Employees',
      value: employees.length,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Assigned',
      value: assignedEmployees.size,
      icon: UserCheck,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Unassigned',
      value: employees.length - assignedEmployees.size,
      icon: UserX,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Morning Shift',
      value: morningShifts,
      icon: Sun,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Evening Shift',
      value: eveningShifts,
      icon: Clock,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Night Shift',
      value: nightShifts,
      icon: Moon,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    {
      label: 'Weekly Off',
      value: Math.floor(employees.length * 4),
      icon: CalendarDays,
      color: 'text-gray-500',
      bg: 'bg-gray-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}