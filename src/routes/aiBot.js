/**
 * AI Chatbot Route
 * POST /api/ai-bot/ask — Ask the HR assistant a question
 */

const express = require('express');
const router = express.Router();
const models = require('../models');
const AiBotService = require('../services/aiBotService');

const bot = new AiBotService(models);

/**
 * Middleware to extract authenticated user
 * Uses the same auth pattern as other routes (Authorization header with Bearer token)
 */
const jwt = require('jsonwebtoken');
const config = require('../config/config');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * POST /api/ai-bot/ask
 * Ask the AI HR assistant a question
 * Body: { message: string }
 * Returns: { reply: string, quickReplies?: string[] }
 */
router.post('/ask', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Please provide a message to ask the assistant.' });
    }

    // Fetch full user profile for the bot to reference
    const { Employee } = models;
    const user = await Employee.findOne({
      where: { employeeId: req.user.employeeId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await bot.processMessage(message, user);
    
    res.json({
      reply: result.reply,
      quickReplies: result.quickReplies || [],
    });
  } catch (err) {
    console.error('[AI Bot] Error processing message:', err);
    res.status(500).json({ error: 'Sorry, I encountered an error processing your request.' });
  }
});

/**
 * GET /api/ai-bot/health
 * Simple health check
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'HR AI Assistant v1.0' });
});

module.exports = router;