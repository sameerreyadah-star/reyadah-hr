const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Ticket, Expense, Loan, Employee, MedicalReimbursement, AirTicketReimbursement } = require('../models');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer setup for file uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'requests');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ==================== TICKETS ====================

// Create a ticket
router.post('/tickets', auth, asyncHandler(async (req, res) => {
  const { subject, category, description, priority } = req.body;
  if (!subject || !description) return res.status(400).json({ error: 'Subject and description are required' });

  const ticket = await Ticket.create({
    employeeId: req.user.employeeId,
    subject,
    category: category || 'other',
    description,
    priority: priority || 'medium',
  });
  res.status(201).json(ticket);
}));

// List my tickets
router.get('/tickets', auth, asyncHandler(async (req, res) => {
  const where = { employeeId: req.user.employeeId };
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    where.employeeId = req.user.employeeId;
  }
  const tickets = await Ticket.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json(tickets);
}));

// List all tickets (admin/manager)
router.get('/tickets/all', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const tickets = await Ticket.findAll({
    include: [{ model: Employee, attributes: ['name', 'employeeId', 'photoUrl'] }],
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  res.json(tickets);
}));

// Respond to a ticket (admin)
router.put('/tickets/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const ticket = await Ticket.findByPk(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { adminResponse, status } = req.body;
  const update = {};
  if (adminResponse !== undefined) update.adminResponse = adminResponse;
  if (status !== undefined) {
    update.status = status;
    if (status === 'resolved' || status === 'closed') update.resolvedAt = new Date();
  }
  await ticket.update(update);
  res.json(ticket);
}));

// ==================== EXPENSES ====================

// Create an expense
router.post('/expenses', auth, upload.single('invoice'), asyncHandler(async (req, res) => {
  const { amount, category, description, expenseDate } = req.body;
  if (!amount || !description || !expenseDate) return res.status(400).json({ error: 'Amount, description, and date are required' });

  const expense = await Expense.create({
    employeeId: req.user.employeeId,
    amount: parseFloat(amount),
    category: category || 'other',
    description,
    expenseDate,
    invoiceUrl: req.file ? `/uploads/requests/${req.file.filename}` : '',
  });
  res.status(201).json(expense);
}));

// List my expenses
router.get('/expenses', auth, asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    where.employeeId = req.user.employeeId;
  }
  const expenses = await Expense.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json(expenses);
}));

// Admin manage expense
router.put('/expenses/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const expense = await Expense.findByPk(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  const { status, adminNote } = req.body;
  const update = {};
  if (status !== undefined) {
    update.status = status;
    if (status === 'reimbursed') update.reimbursedAt = new Date();
  }
  if (adminNote !== undefined) update.adminNote = adminNote;
  await expense.update(update);
  res.json(expense);
}));

// ==================== LOANS ====================

// Apply for a loan
router.post('/loans', auth, asyncHandler(async (req, res) => {
  const { amount, purpose, totalInstallments } = req.body;
  if (!amount || !purpose || !totalInstallments) {
    return res.status(400).json({ error: 'Amount, purpose, and total installments are required' });
  }

  const loanAmount = parseFloat(amount);
  if (loanAmount > 2000) return res.status(400).json({ error: 'Maximum loan amount is 2000 AED' });
  if (loanAmount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (totalInstallments < 1 || totalInstallments > 12) return res.status(400).json({ error: 'Installments must be between 1 and 12' });

  const installmentAmount = Math.round((loanAmount / totalInstallments) * 100) / 100;

  const loan = await Loan.create({
    employeeId: req.user.employeeId,
    amount: loanAmount,
    purpose,
    totalInstallments: parseInt(totalInstallments, 10),
    installmentAmount,
    remainingAmount: loanAmount,
  });
  res.status(201).json(loan);
}));

// List my loans
router.get('/loans', auth, asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    where.employeeId = req.user.employeeId;
  }
  const loans = await Loan.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json(loans);
}));

// Pay an installment
router.post('/loans/:id/pay-installment', auth, asyncHandler(async (req, res) => {
  const loan = await Loan.findByPk(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.employeeId !== req.user.employeeId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (loan.status !== 'active') return res.status(400).json({ error: 'Loan is not active' });
  if (loan.paidInstallments >= loan.totalInstallments) return res.status(400).json({ error: 'All installments already paid' });

  const newPaid = loan.paidInstallments + 1;
  const newRemaining = Math.max(0, loan.remainingAmount - loan.installmentAmount);
  const update = {
    paidInstallments: newPaid,
    remainingAmount: Math.round(newRemaining * 100) / 100,
  };
  if (newPaid >= loan.totalInstallments) {
    update.status = 'completed';
    update.completedAt = new Date();
  }
  await loan.update(update);
  res.json(loan);
}));

// Admin manage loan
router.put('/loans/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const loan = await Loan.findByPk(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });

  const { status, adminNote } = req.body;
  const update = {};
  if (status !== undefined) {
    update.status = status;
    if (status === 'approved') update.approvedAt = new Date();
    if (status === 'active') update.approvedAt = new Date();
  }
  if (adminNote !== undefined) update.adminNote = adminNote;
  await loan.update(update);
  res.json(loan);
}));

// ==================== MEDICAL REIMBURSEMENT ====================

// Create a medical reimbursement request
router.post('/medical-reimbursements', auth, upload.single('receipt'), asyncHandler(async (req, res) => {
  const { amount, medicalType, description, hospitalName, expenseDate } = req.body;
  if (!amount || !description || !hospitalName || !expenseDate) {
    return res.status(400).json({ error: 'Amount, description, hospital name, and date are required' });
  }

  const reimbursement = await MedicalReimbursement.create({
    employeeId: req.user.employeeId,
    amount: parseFloat(amount),
    medicalType: medicalType || 'other',
    description,
    hospitalName,
    expenseDate,
    receiptUrl: req.file ? `/uploads/requests/${req.file.filename}` : '',
  });
  res.status(201).json(reimbursement);
}));

// Get my medical reimbursement requests
router.get('/medical-reimbursements', auth, asyncHandler(async (req, res) => {
  const reimbursements = await MedicalReimbursement.findAll({
    where: { employeeId: req.user.employeeId },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json(reimbursements);
}));

// Get all medical reimbursement requests (manager/admin)
router.get('/medical-reimbursements/all', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const reimbursements = await MedicalReimbursement.findAll({
    include: [{ model: Employee, attributes: ['name', 'employeeId', 'photoUrl'] }],
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  res.json(reimbursements);
}));

// Update medical reimbursement status (manager approval)
router.put('/medical-reimbursements/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const reimbursement = await MedicalReimbursement.findByPk(req.params.id);
  if (!reimbursement) return res.status(404).json({ error: 'Reimbursement not found' });

  const { status, managerNote, adminNote } = req.body;
  const update = {};
  if (status !== undefined) {
    update.status = status;
    if (status === 'approved') update.approvedAt = new Date();
    if (status === 'reimbursed') update.reimbursedAt = new Date();
  }
  if (managerNote !== undefined) update.managerNote = managerNote;
  if (adminNote !== undefined) update.adminNote = adminNote;
  await reimbursement.update(update);
  res.json(reimbursement);
}));

// ==================== AIR TICKET REIMBURSEMENT ====================

// Create an air ticket reimbursement request
router.post('/air-tickets', auth, upload.single('invoice'), asyncHandler(async (req, res) => {
  const { amount, ticketType, purpose, departureCity, destinationCity, airline, ticketNumber, departureDate, returnDate } = req.body;
  if (!amount || !purpose || !departureCity || !destinationCity || !airline || !ticketNumber || !departureDate) {
    return res.status(400).json({ error: 'Required fields: amount, purpose, cities, airline, ticket number, and departure date' });
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount > 500) {
    return res.status(400).json({ error: 'Amount cannot exceed AED 500 for air ticket reimbursement' });
  }

  const airTicket = await AirTicketReimbursement.create({
    employeeId: req.user.employeeId,
    amount: parsedAmount,
    ticketType: ticketType || 'domestic',
    purpose,
    departureCity,
    destinationCity,
    airline,
    ticketNumber,
    departureDate,
    returnDate: returnDate || null,
    invoiceUrl: req.file ? `/uploads/requests/${req.file.filename}` : '',
  });
  res.status(201).json(airTicket);
}));

// Get my air ticket reimbursement requests
router.get('/air-tickets', auth, asyncHandler(async (req, res) => {
  const airTickets = await AirTicketReimbursement.findAll({
    where: { employeeId: req.user.employeeId },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json(airTickets);
}));

// Get all air ticket reimbursement requests (manager/admin)
router.get('/air-tickets/all', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const airTickets = await AirTicketReimbursement.findAll({
    include: [{ model: Employee, attributes: ['name', 'employeeId', 'photoUrl'] }],
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  res.json(airTickets);
}));

// Update air ticket reimbursement status (manager approval)
router.put('/air-tickets/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const airTicket = await AirTicketReimbursement.findByPk(req.params.id);
  if (!airTicket) return res.status(404).json({ error: 'Air ticket request not found' });

  const { status, managerNote, adminNote } = req.body;
  const update = {};
  if (status !== undefined) {
    update.status = status;
    if (status === 'approved') update.approvedAt = new Date();
    if (status === 'reimbursed') update.reimbursedAt = new Date();
  }
  if (managerNote !== undefined) update.managerNote = managerNote;
  if (adminNote !== undefined) update.adminNote = adminNote;
  await airTicket.update(update);
  res.json(airTicket);
}));

module.exports = router;