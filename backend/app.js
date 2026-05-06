import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

let connectPromise = null;

export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (connectPromise) {
    await connectPromise;
    return;
  }

  const mongoUri = process.env.MONGODB_URI || process.env.mongoURI;
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI (or mongoURI) in backend environment');
  }

  connectPromise = mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB || 'music_app',
  });
  await connectPromise;
  connectPromise = null;
}

const videoSchema = new mongoose.Schema(
  {
    id: String,
    videoId: String,
    title: String,
    channelTitle: String,
    thumbnail: String,
    thumbnailHigh: String,
    duration: Number,
    durationFormatted: String,
    publishedAt: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, index: true },
  picture: { type: String, default: '' },
  createdAt: { type: Number, required: true },
  updatedAt: { type: Number, required: true },
});

const playlistSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  visibility: { type: String, enum: ['public', 'private'], required: true },
  songs: { type: [videoSchema], default: [] },
  createdAt: { type: Number, required: true },
});

const likeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  video: { type: videoSchema, required: true },
  createdAt: { type: Number, required: true },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Playlist = mongoose.models.Playlist || mongoose.model('Playlist', playlistSchema);
const Like = mongoose.models.Like || mongoose.model('Like', likeSchema);

app.use(async (_req, _res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/users', async (req, res) => {
  const { id, email } = req.query;
  const query = {};
  if (id) query.id = String(id);
  if (email) query.email = String(email).trim().toLowerCase();
  const users = await User.find(query).lean();
  res.json(users);
});

app.get('/users/:id', async (req, res) => {
  const user = await User.findOne({ id: req.params.id }).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

app.post('/users', async (req, res) => {
  const payload = req.body;
  const user = await User.create(payload);
  res.status(201).json(user);
});

app.patch('/users/:id', async (req, res) => {
  const user = await User.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true }).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

app.get('/playlists', async (req, res) => {
  const { userId, visibility } = req.query;
  const query = {};
  if (userId) query.userId = String(userId);
  if (visibility) query.visibility = String(visibility);
  const playlists = await Playlist.find(query).sort({ createdAt: -1 }).lean();
  res.json(playlists);
});

app.get('/playlists/:id', async (req, res) => {
  const playlist = await Playlist.findOne({ id: req.params.id }).lean();
  if (!playlist) return res.status(404).json({ message: 'Playlist not found' });
  res.json(playlist);
});

app.post('/playlists', async (req, res) => {
  const payload = req.body;
  if (!payload?.id) payload.id = `pl_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
  const created = await Playlist.create(payload);
  res.status(201).json(created);
});

app.patch('/playlists/:id', async (req, res) => {
  const playlist = await Playlist.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true }).lean();
  if (!playlist) return res.status(404).json({ message: 'Playlist not found' });
  res.json(playlist);
});

app.delete('/playlists/:id', async (req, res) => {
  await Playlist.deleteOne({ id: req.params.id });
  res.status(204).end();
});

app.get('/likes', async (req, res) => {
  const { userId } = req.query;
  const query = {};
  if (userId) query.userId = String(userId);
  const likes = await Like.find(query).sort({ createdAt: -1 }).lean();
  res.json(likes);
});

app.get('/likes/check', async (req, res) => {
  const { userId, videoId } = req.query;
  if (!userId || !videoId) return res.status(400).json({ message: 'userId and videoId required' });
  const like = await Like.findOne({ userId: String(userId), 'video.videoId': String(videoId) }).lean();
  if (!like) return res.status(404).json({ message: 'Like not found' });
  res.json(like);
});

app.post('/likes', async (req, res) => {
  const payload = req.body;
  if (!payload?.id) payload.id = `like_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
  if (!payload?.createdAt) payload.createdAt = Date.now();
  const created = await Like.create(payload);
  res.status(201).json(created);
});

app.delete('/likes/:id', async (req, res) => {
  await Like.deleteOne({ id: req.params.id });
  res.status(204).end();
});

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  res.status(500).json({ message });
});

export default app;
