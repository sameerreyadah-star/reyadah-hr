import React from 'react';
import { Card, CardContent } from '../ui/Card';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Search, RotateCcw, Filter } from 'lucide-react';
import { mockCompanies, mockBranches, mockDepartments, mockDesignations, mockEmployees, mockShifts, mockStatuses } from '../../data/mockData';

export default function FilterSection({ filters, onFilterChange, onSearch, onReset }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <Select
            label="Company"
            placeholder="All Companies"
            options={mockCompanies}
            value={filters.company}
            onChange={(e) => onFilterChange('company', e.target.value)}
          />
          <Select
            label="Branch"
            placeholder="All Branches"
            options={mockBranches}
            value={filters.branch}
            onChange={(e) => onFilterChange('branch', e.target.value)}
          />
          <Select
            label="Department"
            placeholder="All Departments"
            options={mockDepartments}
            value={filters.department}
            onChange={(e) => onFilterChange('department', e.target.value)}
          />
          <Select
            label="Designation"
            placeholder="All Designations"
            options={mockDesignations}
            value={filters.designation}
            onChange={(e) => onFilterChange('designation', e.target.value)}
          />
          <Select
            label="Employee"
            placeholder="All Employees"
            options={mockEmployees}
            value={filters.employee}
            onChange={(e) => onFilterChange('employee', e.target.value)}
          />
          <Select
            label="Shift"
            placeholder="All Shifts"
            options={mockShifts}
            value={filters.shift}
            onChange={(e) => onFilterChange('shift', e.target.value)}
          />
          <Input
            label="Date Range"
            type="date"
            value={filters.dateRange}
            onChange={(e) => onFilterChange('dateRange', e.target.value)}
          />
          <Select
            label="Status"
            placeholder="All Status"
            options={mockStatuses}
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button variant="primary" size="sm" onClick={onSearch} icon={<Search className="h-4 w-4" />}>
            Search
          </Button>
          <Button variant="outline" size="sm" onClick={onReset} icon={<RotateCcw className="h-4 w-4" />}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}