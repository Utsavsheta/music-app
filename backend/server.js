import 'dotenv/config';
import app, { connectToDatabase } from './app.js';

const port = Number(process.env.PORT || 3001);
await connectToDatabase();
app.listen(port, () => {
  console.log(`Mongo backend running on :${port}`);
});

