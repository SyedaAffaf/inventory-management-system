import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = process.env.PORT || 5000;

// Allow the local frontend plus any extra origins listed in FRONTEND_URL (comma separated)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
];
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
}));
app.use(express.json());

// ---- Environment check -------------------------------------------------
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`Missing environment variables: ${missing.join(', ')}. Check backend/.env`);
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// Server-side client. Also used to verify user tokens, so the anon key is not needed here.
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// ---- Helpers ------------------------------------------------------------
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error('SERVER ERROR:', err.message);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

function validateProduct(body, { partial = false } = {}) {
  const name = String(body.name ?? '').trim();
  const sku = String(body.sku ?? '').trim();
  const category = String(body.category ?? '').trim() || 'General';
  const quantity = body.quantity ?? 0;
  const price = body.price ?? 0;
  const reorder_level = body.reorder_level ?? 5;

  if (name.length < 2 || name.length > 100) return { error: 'Product name must be between 2 and 100 characters.' };
  if (!sku) return { error: 'SKU is required.' };
  if (sku.length > 50) return { error: 'SKU must be 50 characters or fewer.' };
  if (category.length > 50) return { error: 'Category must be 50 characters or fewer.' };

  const q = Number(quantity);
  const r = Number(reorder_level);
  const p = Number(price);
  if (!Number.isInteger(q) || q < 0) return { error: 'Quantity must be a whole number, 0 or more.' };
  if (!Number.isInteger(r) || r < 0) return { error: 'Low-stock level must be a whole number, 0 or more.' };
  if (!Number.isFinite(p) || p < 0) return { error: 'Price must be a number, 0 or more.' };

  return { value: { name, sku, category, quantity: q, price: p, reorder_level: r } };
}

function friendlyDbError(error) {
  if (error.code === '23505') return 'A product with this SKU already exists.';
  if (error.code === '42P01') return 'Database tables are missing. Run database/schema.sql in Supabase.';
  return error.message;
}

// ---- Auth middleware ----------------------------------------------------
async function requireUser(req, res, next) {
  try {
    if (!admin) return res.status(500).json({ error: 'Supabase is not configured. Check backend/.env.' });
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Please sign in first.' });

    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      console.error('AUTH FAILED:', error?.message || 'no user returned', '| status:', error?.status);
      return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    console.error('AUTH ERROR:', err.message);
    res.status(401).json({ error: 'Could not verify your session.' });
  }
}

// ---- Routes ---------------------------------------------------------------
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', message: 'Inventory API is running', supabaseConfigured: Boolean(admin) }));

app.use('/api', requireUser);

app.get('/api/products', wrap(async (req, res) => {
  const search = String(req.query.search || '').replace(/[^\w\s.-]/g, '').trim();
  const category = String(req.query.category || '').trim();
  let query = admin.from('products').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) return res.status(400).json({ error: friendlyDbError(error) });
  res.json(data);
}));

app.post('/api/products', wrap(async (req, res) => {
  const { value, error: vError } = validateProduct(req.body || {});
  if (vError) return res.status(400).json({ error: vError });

  const { data, error } = await admin.from('products')
    .insert({ user_id: req.user.id, ...value }).select().single();
  if (error) return res.status(400).json({ error: friendlyDbError(error) });

  await admin.from('activity_logs').insert({ user_id: req.user.id, action: 'Product added', details: `${data.name} (${data.sku})` });
  res.status(201).json(data);
}));

app.put('/api/products/:id', wrap(async (req, res) => {
  const { value, error: vError } = validateProduct(req.body || {});
  if (vError) return res.status(400).json({ error: vError });

  const { data, error } = await admin.from('products')
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: friendlyDbError(error) });
  if (!data) return res.status(404).json({ error: 'Product not found.' });

  await admin.from('activity_logs').insert({ user_id: req.user.id, action: 'Product updated', details: `${data.name} (${data.sku})` });
  res.json(data);
}));

app.delete('/api/products/:id', wrap(async (req, res) => {
  const { data: product } = await admin.from('products').select('name, sku')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const { error } = await admin.from('products').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(400).json({ error: friendlyDbError(error) });

  await admin.from('activity_logs').insert({ user_id: req.user.id, action: 'Product deleted', details: `${product.name} (${product.sku})` });
  res.json({ message: 'Product deleted successfully.' });
}));

app.get('/api/activity', wrap(async (req, res) => {
  const { data, error } = await admin.from('activity_logs').select('*').eq('user_id', req.user.id)
    .order('created_at', { ascending: false }).limit(8);
  if (error) return res.status(400).json({ error: friendlyDbError(error) });
  res.json(data);
}));

// Unknown routes and CORS errors return JSON instead of HTML
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, _req, res, _next) => res.status(500).json({ error: err.message || 'Server error.' }));

app.listen(port, () => console.log(`Inventory API running at http://localhost:${port}`));