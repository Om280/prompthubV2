/** Test users of the fake Supabase Auth server. Invented test data, not real accounts. */
export const USERS = {
  ada: {
    id: "a0a0a0a0-0000-4000-8000-00000000000a",
    email: "ada.tester@example.com",
    name: "Ada Tester",
    avatarUrl: null,
  },
  bob: {
    id: "b0b0b0b0-0000-4000-8000-00000000000b",
    email: "bob.tester@example.com",
    name: "Bob Tester",
    avatarUrl: null,
  },
};

export const FAKE_SUPABASE_PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
export const FAKE_SUPABASE_URL = `http://127.0.0.1:${FAKE_SUPABASE_PORT}`;
