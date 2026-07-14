/**
 * AI HR Chatbot Service
 * 
 * Intelligent Q&A engine that parses natural language HR queries,
 * maps them to database queries, and returns human-readable responses.
 * Supports questions about:
 *   - Employee profiles (my info, team info)
 *   - Attendance records (my attendance, team attendance)
 *   - Leave balances and requests
 *   - Payroll and payslips
 *   - Company policies / general HR info
 *   - Celebrations (birthdays, anniversaries)
 *   - ZKTeco device status
 */

const { Op } = require('sequelize');

class AiBotService {
  constructor(models) {
    this.Employee = models.Employee;
    this.Attendance = models.Attendance;
    this.Payroll = models.Payroll;
    this.LeaveRequest = models.LeaveRequest;
  }

  /**
   * Process a natural language message and return a reply
   * @param {string} message - The user's question
   * @param {object} user - The authenticated user making the request
   * @returns {object} { reply, data?, quickReplies? }
   */
  async processMessage(message, user) {
    const query = message.trim().toLowerCase();
    
    // Route to appropriate handler based on intent detection
    if (this._matchesAny(query, ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'])) {
      return this._greeting(user);
    }
    
    if (this._matchesAny(query, ['help', 'what can you do', 'commands', 'capabilities'])) {
      return this._help();
    }

    if (this._matchesAny(query, ['who am i', 'my profile', 'my details', 'my info', 'about me'])) {
      return this._myProfile(user);
    }

    if (this._matchesAny(query, ['my attendance', 'my attendance record', 'my clock', 'did i clock', 'am i clocked'])) {
      return await this._myAttendance(user);
    }

    if (this._isLeaveBalanceQuery(query)) {
      return await this._leaveBalance(user);
    }

    if (this._isLeaveRequestQuery(query)) {
      return await this._leaveRequests(user);
    }

    if (this._isTeamQuery(query) && this._isTeamRole(user)) {
      return await this._teamInfo(user);
    }

    if (this._matchesAny(query, ['my payslip', 'my payroll', 'my salary', 'my pay'])) {
      return await this._myPayroll(user);
    }

    if (this._matchesAny(query, ['birthday', 'birthdays', 'celebration', 'celebrations', 'anniversary', 'anniversaries'])) {
      return await this._celebrations(user);
    }

    if (this._matchesAny(query, ['employees count', 'how many employees', 'team size', 'total employees', 'headcount'])) {
      return await this._employeeCount(user);
    }

    if (this._matchesAny(query, ['who is absent', 'absent today', 'absentees'])) {
      return await this._absentToday(user);
    }

    if (this._matchesAny(query, ['my shift', 'shift', 'my schedule', 'shift roster'])) {
      return this._myShift(user);
    }

    if (this._matchesAny(query, ['pending leaves', 'pending leave requests', 'approvals pending', 'leave approvals'])) {
      return await this._pendingApprovals(user);
    }

    // Fallback - generic answer or suggest help
    return this._fallback(query, user);
  }

  // ==================== Intent Detection Helpers ====================

  _matchesAny(text, keywords) {
    return keywords.some(kw => text.includes(kw));
  }

  _isLeaveBalanceQuery(query) {
    const leaves = this._matchesAny(query, ['leave balance', 'leave left', 'remaining leave', 'annual leave', 'ph leave', 'my leave balance', 'how many leave days']);
    return leaves;
  }

  _isLeaveRequestQuery(query) {
    return this._matchesAny(query, ['my leave request', 'my leaves', 'my holiday', 'leave status', 'leave history']);
  }

  _isTeamQuery(query) {
    return this._matchesAny(query, ['team', 'employees', 'staff', 'who works here', 'colleagues', 'directory']);
  }

  _isTeamRole(user) {
    return ['admin', 'restaurant-manager', 'company-manager'].includes(user.role);
  }

  // ==================== Response Handlers ====================

  _greeting(user) {
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return {
      reply: `${timeGreeting}, ${user.name || user.employeeId}! 👋 I'm your HR Assistant. I can help you with:\n\n` +
        `• 📋 Your profile & attendance\n` +
        `• 💰 Payslips & payroll\n` +
        `• 📅 Leave balances & requests\n` +
        `• 👥 Team info (if you're a manager)\n` +
        `• 🎉 Celebrations & birthdays\n\n` +
        `Type "help" to see all my capabilities, or just ask me a question!`,
      quickReplies: ['My attendance', 'Leave balance', 'My profile', 'Help']
    };
  }

  _help() {
    return {
      reply: `🤖 **HR Assistant Capabilities**\n\n` +
        `**Personal queries:**\n` +
        `• "Who am I?" — Your profile details\n` +
        `• "My attendance" — Today's attendance\n` +
        `• "Leave balance" — Your remaining leave\n` +
        `• "My leaves" — Your leave request history\n` +
        `• "My payslip" — Recent payslips\n` +
        `• "My shift" — Your shift schedule\n\n` +
        `**Manager queries** (managers only):\n` +
        `• "Team info" — Team directory overview\n` +
        `• "Who is absent?" — Today's absentees\n` +
        `• "Pending leaves" — Leave approval queue\n` +
        `• "Employee count" — Headcount\n\n` +
        `**General:**\n` +
        `• "Birthdays" — Today's celebrations\n` +
        `• "Help" — Show this message again\n\n` +
        `Just type your question naturally!`,
      quickReplies: ['My attendance', 'My profile', 'Leave balance', 'Birthdays']
    };
  }

  async _myProfile(user) {
    const emp = await this.Employee.findOne({
      where: { employeeId: user.employeeId },
      attributes: ['name', 'employeeId', 'email', 'designation', 'role', 'salary', 'photoUrl', 'createdAt', 'shiftRoster']
    });

    if (!emp) {
      return { reply: 'I could not find your profile information. Please try logging in again.' };
    }

    const shiftText = emp.shiftRoster?.shiftName 
      ? `${emp.shiftRoster.shiftName} (${emp.shiftRoster.startTime || '?'} - ${emp.shiftRoster.endTime || '?'})`
      : 'Not assigned';
    const joinedDate = emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : 'N/A';

    return {
      reply: `📋 **${emp.name}**\n` +
        `• Employee ID: \`${emp.employeeId}\`\n` +
        `• Email: ${emp.email || 'Not set'}\n` +
        `• Designation: ${emp.designation || 'Not set'}\n` +
        `• Role: ${emp.role}\n` +
        `• Salary: AED ${Number(emp.salary || 0).toLocaleString()}\n` +
        `• Shift: ${shiftText}\n` +
        `• Joined: ${joinedDate}\n\n` +
        `*Your profile photo and documents are available in the Profile section.*`,
      quickReplies: ['My attendance', 'Leave balance', 'My payslip']
    };
  }

  async _myAttendance(user) {
    const today = new Date().toISOString().slice(0, 10);
    const record = await this.Attendance.findOne({
      where: { employeeId: user.employeeId, date: today }
    });

    if (!record) {
      // Check if there's any recent attendance
      const recent = await this.Attendance.findOne({
        where: { employeeId: user.employeeId },
        order: [['date', 'DESC']]
      });

      if (recent) {
        return {
          reply: `You have **no attendance record** for today (${today}).\n\n` +
            `📅 Your last recorded attendance was on **${recent.date}**.\n` +
            `Status: ${recent.status === 'p' ? '✅ Present' : recent.status === 'a' ? '❌ Absent' : recent.status === 'o' ? '🏖️ Holiday' : 'Not marked'}\n` +
            `Clock In: ${recent.clockIn ? new Date(recent.clockIn).toLocaleTimeString() : '-'}\n` +
            `Clock Out: ${recent.clockOut ? new Date(recent.clockOut).toLocaleTimeString() : '-'}`,
          quickReplies: ['Clock In', 'My attendance records', 'Leave balance']
        };
      }

      return {
        reply: `You have **no attendance record** for today (${today}). Please clock in to start your day! 👋`,
        quickReplies: ['Clock In', 'My profile', 'Help']
      };
    }

    const clockInTime = record.clockIn ? new Date(record.clockIn).toLocaleTimeString() : '-';
    const clockOutTime = record.clockOut ? new Date(record.clockOut).toLocaleTimeString() : 'Not yet clocked out';
    const statusText = record.status === 'p' ? '✅ Present' : record.status === 'a' ? '❌ Absent' : 'Not marked';

    return {
      reply: `📅 **Today's Attendance (${today})**\n\n` +
        `• Status: ${statusText}\n` +
        `• Clock In: ${clockInTime}\n` +
        `• Clock Out: ${clockOutTime}\n` +
        `• Shift: ${record.shift || user.shiftRoster?.shiftName || 'General'}`,
      quickReplies: ['Clock Out', 'My attendance records', 'My profile']
    };
  }

  async _leaveBalance(user) {
    const now = new Date();
    const year = now.getFullYear();

    // Count approved leaves this year for this employee
    const approvedLeaves = await this.LeaveRequest.count({
      where: {
        employeeId: user.employeeId,
        status: 'approved',
        startDate: { [Op.gte]: `${year}-01-01` }
      }
    });

    const pendingLeaves = await this.LeaveRequest.count({
      where: {
        employeeId: user.employeeId,
        status: { [Op.in]: ['pending_manager', 'pending_company'] }
      }
    });

    // Default leave entitlement (can be customized per company policy)
    const annualEntitlement = 30; // 30 working days
    const phEntitlement = 10;     // 10 public holidays
    const usedAnnual = approvedLeaves;
    const remainingAnnual = Math.max(0, annualEntitlement - usedAnnual);

    return {
      reply: `📅 **Your Leave Summary (${year})**\n\n` +
        `**Annual Leave**\n` +
        `• Entitlement: ${annualEntitlement} days\n` +
        `• Used: ${usedAnnual} days\n` +
        `• Remaining: **${remainingAnnual} days**\n` +
        `• Pending approval: ${pendingLeaves}\n\n` +
        `**Public Holidays**\n` +
        `• Entitlement: ${phEntitlement} days\n\n` +
        `*You can apply for leave from the Leave section in the sidebar.*`,
      quickReplies: ['Apply leave', 'My leaves', 'My attendance']
    };
  }

  async _leaveRequests(user) {
    const leaves = await this.LeaveRequest.findAll({
      where: { employeeId: user.employeeId },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    if (!leaves || leaves.length === 0) {
      return {
        reply: `You have **no leave requests** on record. Would you like to apply for leave? 📅`,
        quickReplies: ['Apply leave', 'Leave balance', 'My attendance']
      };
    }

    const leaveList = leaves.map((l, i) => {
      const statusEmoji = l.status === 'approved' ? '✅' : l.status === 'rejected' ? '❌' : '⏳';
      return `${i + 1}. ${statusEmoji} **${l.leaveType}** (${l.startDate} → ${l.endDate}) — ${l.status.replace('_', ' ')}`;
    }).join('\n');

    return {
      reply: `📋 **Your Recent Leave Requests**\n\n${leaveList}\n\n*View all leaves in the Leave section.*`,
      quickReplies: ['Leave balance', 'Apply leave', 'My attendance']
    };
  }

  async _teamInfo(user) {
    if (!this._isTeamRole(user)) {
      return { reply: 'Sorry, only managers can view team information.' };
    }

    const employees = await this.Employee.findAll({
      attributes: ['employeeId', 'name', 'designation', 'role', 'email', 'shiftRoster'],
      order: [['name', 'ASC']]
    });

    if (!employees || employees.length === 0) {
      return { reply: 'No employees found in the system.' };
    }

    const roleCounts = {};
    employees.forEach(emp => {
      const role = emp.role || 'employee';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    const roleSummary = Object.entries(roleCounts)
      .map(([role, count]) => `• ${role}: ${count}`)
      .join('\n');

    const withoutShift = employees.filter(e => !e.shiftRoster?.shiftName).length;

    return {
      reply: `👥 **Team Overview** — ${employees.length} total\n\n` +
        `**By Role:**\n${roleSummary}\n\n` +
        `**Staff without shifts:** ${withoutShift}\n` +
        `**Managers:** ${(roleCounts['admin'] || 0) + (roleCounts['restaurant-manager'] || 0) + (roleCounts['company-manager'] || 0)}\n\n` +
        `*For detailed info, open the Admin → Team Directory section.*`,
      quickReplies: ['Who is absent?', 'Employee count', 'Pending leaves']
    };
  }

  async _myPayroll(user) {
    const payslips = await this.Payroll.findAll({
      where: { employeeId: user.employeeId },
      order: [['year', 'DESC'], ['month', 'DESC']],
      limit: 3
    });

    if (!payslips || payslips.length === 0) {
      return {
        reply: `No payslips found for your account. Payslips are generated after payroll is processed each month.`,
        quickReplies: ['My profile', 'My attendance', 'Leave balance']
      };
    }

    const payslipList = payslips.map(p => {
      const monthName = new Date(p.year, p.month - 1, 1).toLocaleString('default', { month: 'long' });
      return `• **${monthName} ${p.year}**: Gross AED ${Number(p.gross).toLocaleString()} → Net **AED ${Number(p.net).toLocaleString()}**`;
    }).join('\n');

    return {
      reply: `💰 **Your Recent Payslips**\n\n${payslipList}\n\n*View full details in the Payslips section.*`,
      quickReplies: ['My profile', 'Leave balance', 'My attendance']
    };
  }

  async _celebrations(user) {
    const today = new Date();
    const todayMD = `${today.getMonth() + 1}-${today.getDate()}`;

    const employees = await this.Employee.findAll({
      attributes: ['name', 'employeeId', 'designation', 'photoUrl', 'dateOfBirth', 'createdAt']
    });

    const birthdays = employees.filter(e => {
      if (!e.dateOfBirth) return false;
      const dob = new Date(e.dateOfBirth);
      return `${dob.getMonth() + 1}-${dob.getDate()}` === todayMD;
    });

    const anniversaries = employees.filter(e => {
      if (!e.createdAt) return false;
      const joined = new Date(e.createdAt);
      return `${joined.getMonth() + 1}-${joined.getDate()}` === todayMD && 
             joined.getFullYear() < today.getFullYear();
    });

    const parts = [];
    if (birthdays.length > 0) {
      parts.push(`🎂 **Birthdays Today:**\n${birthdays.map(b => `• ${b.name} (${b.designation || 'Team Member'})`).join('\n')}`);
    }
    if (anniversaries.length > 0) {
      parts.push(`🎉 **Work Anniversaries Today:**\n${anniversaries.map(a => {
        const years = today.getFullYear() - new Date(a.createdAt).getFullYear();
        return `• ${a.name} — ${years} year${years > 1 ? 's' : ''}!`;
      }).join('\n')}`);
    }

    if (parts.length === 0) {
      return {
        reply: `No celebrations today! 🎈\n\nCheck back tomorrow for birthdays and anniversaries.`,
        quickReplies: ['My profile', 'Team info', 'My attendance']
      };
    }

    return {
      reply: `🎊 **Today's Celebrations — ${today.toLocaleDateString()}**\n\n${parts.join('\n\n')}\n\n*Spread the joy!* 🎉`,
      quickReplies: ['My attendance', 'My profile']
    };
  }

  async _employeeCount(user) {
    const count = await this.Employee.count();
    const roles = await this.Employee.findAll({
      attributes: ['role'],
      group: ['role']
    });

    // We'll count manually
    const allEmps = await this.Employee.findAll({ attributes: ['role'] });
    const roleCounts = {};
    allEmps.forEach(e => {
      const r = e.role || 'employee';
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    });

    return {
      reply: `👥 **Total Employees: ${count}**\n\n` +
        Object.entries(roleCounts).map(([role, c]) => `• ${role}: ${c}`).join('\n') +
        `\n\n*Manage them from the Admin → Team Directory.*`,
      quickReplies: ['Team info', 'Who is absent?', 'Birthdays']
    };
  }

  async _absentToday(user) {
    if (!this._isTeamRole(user)) {
      return { reply: 'Sorry, only managers can view team attendance status.' };
    }

    const today = new Date().toISOString().slice(0, 10);
    
    // Get all employees
    const employees = await this.Employee.findAll({
      attributes: ['employeeId', 'name', 'designation', 'photoUrl']
    });

    // Get today's attendance
    const todayAttendance = await this.Attendance.findAll({
      where: { date: today }
    });

    const presentIds = new Set(todayAttendance.filter(a => a.status === 'p').map(a => a.employeeId));
    const absentEmployees = employees.filter(e => !presentIds.has(e.employeeId));

    if (absentEmployees.length === 0) {
      return {
        reply: `✅ **All ${employees.length} employees** are present today! Great attendance! 🎉`,
        quickReplies: ['Team info', 'Employee count', 'My attendance']
      };
    }

    const presentCount = employees.length - absentEmployees.length;
    const absentList = absentEmployees.slice(0, 15).map(e => 
      `• ${e.name || e.employeeId}${e.designation ? ` (${e.designation})` : ''}`
    ).join('\n');

    return {
      reply: `📊 **Today's Attendance (${today})**\n\n` +
        `✅ Present: ${presentCount}\n` +
        `❌ Not marked yet: ${absentEmployees.length}\n\n` +
        (absentList.length > 0 ? `**Not yet marked:**\n${absentList}` : '') +
        (absentEmployees.length > 15 ? `\n...and ${absentEmployees.length - 15} more` : '') +
        `\n\n*Attendance info is available in the Attendance Info section.*`,
      quickReplies: ['Team info', 'Employee count', 'Pending leaves']
    };
  }

  _myShift(user) {
    const shift = user.shiftRoster;
    if (!shift || !shift.shiftName) {
      return {
        reply: `You don't have a shift assigned yet. Please contact your manager to set up your shift roster.`,
        quickReplies: ['My profile', 'My attendance', 'Help']
      };
    }

    return {
      reply: `🕐 **Your Shift Schedule**\n\n` +
        `• Shift: **${shift.shiftName}**\n` +
        `• Start: ${shift.startTime || 'Not set'}\n` +
        `• End: ${shift.endTime || 'Not set'}\n` +
        `${shift.notes ? `• Notes: ${shift.notes}` : ''}\n\n` +
        `*You can view your full schedule in the Attendance section.*`,
      quickReplies: ['My attendance', 'My profile', 'Clock In']
    };
  }

  async _pendingApprovals(user) {
    if (!this._isTeamRole(user)) {
      return { reply: 'Sorry, only managers can view pending leave approvals.' };
    }

    const pending = await this.LeaveRequest.findAll({
      where: { status: { [Op.ne]: 'approved', [Op.ne]: 'rejected' } },
      include: [{ model: this.Employee, attributes: ['name', 'employeeId'] }],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    if (!pending || pending.length === 0) {
      return {
        reply: `✅ No pending leave requests! All leave requests have been processed.`,
        quickReplies: ['Team info', 'Who is absent?', 'My attendance']
      };
    }

    const list = pending.map((l, i) => 
      `${i + 1}. ⏳ ${l.employee?.name || `#${l.employeeId}`} — **${l.leaveType}** (${l.startDate} → ${l.endDate})\n   Status: ${l.status.replace('_', ' ')}`
    ).join('\n');

    return {
      reply: `⏳ **Pending Leave Approvals (${pending.length})**\n\n${list}\n\n*Review and approve from the Leave → Approvals section.*`,
      quickReplies: ['Team info', 'Who is absent?', 'My attendance']
    };
  }

  _fallback(query, user) {
    // Try to provide a helpful response for unrecognized queries
    return {
      reply: `I'm sorry, I didn't quite understand that. 🤔\n\n` +
        `Here are some things you can ask me:\n\n` +
        `• 👤 "Who am I?" — Your profile\n` +
        `• 📅 "My attendance" — Today's status\n` +
        `• 💰 "My payslip" — Recent payslips\n` +
        `• 📋 "Leave balance" — Remaining leave\n` +
        `• 🎉 "Birthdays" — Today's celebrations\n` +
        `• ❓ "Help" — Full list of commands\n\n` +
        `Or just type your question naturally and I'll do my best!`,
      quickReplies: ['Help', 'My attendance', 'Leave balance', 'My profile']
    };
  }
}

module.exports = AiBotService;