const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const PORT = process.env.PORT || 3000;

const sequelize = new Sequelize({ dialect: 'sqlite', storage: './database.sqlite', logging: false });

const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  displayName: { type: DataTypes.STRING },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  bio: { type: DataTypes.TEXT }
});

const Post = sequelize.define('Post', {
  content: { type: DataTypes.TEXT, allowNull: false }
});

const Comment = sequelize.define('Comment', {
  content: { type: DataTypes.TEXT, allowNull: false }
});

const Follow = sequelize.define('Follow', {});
const Like = sequelize.define('Like', {});

User.hasMany(Post, { onDelete: 'CASCADE' });
Post.belongsTo(User);

Post.hasMany(Comment, { onDelete: 'CASCADE' });
Comment.belongsTo(Post);
Comment.belongsTo(User);

User.belongsToMany(User, { as: 'Followers', through: Follow, foreignKey: 'followingId', otherKey: 'followerId' });
User.belongsToMany(User, { as: 'Following', through: Follow, foreignKey: 'followerId', otherKey: 'followingId' });

User.belongsToMany(Post, { through: Like, as: 'LikedPosts' });
Post.belongsToMany(User, { through: Like, as: 'Likers' });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing token' });
  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, displayName });
    const token = jwt.sign({ id: user.id }, SECRET);
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, bio: user.bio } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id }, SECRET);
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, bio: user.bio } });
});

// Create post
app.post('/api/posts', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const post = await Post.create({ content, UserId: req.userId });
  res.json(post);
});

// List posts (simple feed: latest 50)
app.get('/api/posts', async (req, res) => {
  const posts = await Post.findAll({ order: [['createdAt', 'DESC']], limit: 50, include: [{ model: User, attributes: ['id','username','displayName'] }, { model: User, as: 'Likers', attributes: ['id'] }, { model: Comment, include: [{ model: User, attributes: ['id','username','displayName'] }] }] });
  res.json(posts);
});

// Comment on post
app.post('/api/posts/:postId/comments', auth, async (req, res) => {
  const { content } = req.body;
  const { postId } = req.params;
  const post = await Post.findByPk(postId);
  if (!post) return res.status(404).json({ error: 'post not found' });
  const comment = await Comment.create({ content, PostId: post.id, UserId: req.userId });
  res.json(comment);
});

// Like/unlike post
app.post('/api/posts/:postId/like', auth, async (req, res) => {
  const { postId } = req.params;
  const post = await Post.findByPk(postId);
  if (!post) return res.status(404).json({ error: 'post not found' });
  const user = await User.findByPk(req.userId);
  const exists = await post.hasLiker(user);
  if (exists) {
    await post.removeLiker(user);
    return res.json({ liked: false });
  } else {
    await post.addLiker(user);
    return res.json({ liked: true });
  }
});

// Follow/unfollow user
app.post('/api/users/:userId/follow', auth, async (req, res) => {
  const { userId } = req.params;
  if (parseInt(userId) === req.userId) return res.status(400).json({ error: 'cannot follow yourself' });
  const me = await User.findByPk(req.userId);
  const other = await User.findByPk(userId);
  if (!other) return res.status(404).json({ error: 'user not found' });
  const exists = await me.hasFollowing(other);
  if (exists) {
    await me.removeFollowing(other);
    return res.json({ following: false });
  } else {
    await me.addFollowing(other);
    return res.json({ following: true });
  }
});

// Get profile
app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const user = await User.findByPk(userId, { attributes: ['id','username','displayName','bio'], include: [{ model: Post, limit: 10, order: [['createdAt','DESC']] }, { model: User, as: 'Followers', attributes: ['id','username'] }, { model: User, as: 'Following', attributes: ['id','username'] }] });
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(user);
});

// Simple endpoint to get current user
app.get('/api/me', auth, async (req, res) => {
  const user = await User.findByPk(req.userId, { attributes: ['id','username','displayName','bio'] });
  res.json(user);
});

// Serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
  await sequelize.sync();
  app.listen(PORT, () => console.log('Server running on', PORT));
})();
