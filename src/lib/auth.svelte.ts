import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

class AuthStore {
	user = $state<User | null>(null);
	session = $state<Session | null>(null);
	loading = $state(true);
	initialized = false;

	async init() {
		if (this.initialized) return;
		this.initialized = true;
		const { data } = await supabase.auth.getSession();
		this.session = data.session;
		this.user = data.session?.user ?? null;
		this.loading = false;

		supabase.auth.onAuthStateChange((_, session) => {
			this.session = session;
			this.user = session?.user ?? null;
		});
	}

	async signInWithMagicLink(email: string, redirectTo: string) {
		return supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: redirectTo }
		});
	}

	async signOut() {
		await supabase.auth.signOut();
	}
}

export const auth = new AuthStore();
