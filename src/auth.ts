import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

const DISCORD_GUILD_ID = "1483628699541700740";
const EMPLOYEE_ROLE_ID = "1492627316298223727";
const MANAGEMENT_ROLE_ID = "1492211620909420721";

function getRolesFromDiscordRoles(roleIds: string[]) {
  const roles: string[] = [];

  if (roleIds.includes(EMPLOYEE_ROLE_ID)) roles.push("employee");
  if (roleIds.includes(MANAGEMENT_ROLE_ID)) roles.push("management");

  return roles;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Discord({
      authorization: {
        params: {
          scope: "identify guilds.members.read",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "discord" && account.access_token) {
        try {
          const response = await fetch(
            `https://discord.com/api/v10/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
            {
              headers: {
                Authorization: `Bearer ${account.access_token}`,
              },
            }
          );

          if (response.ok) {
            const member = (await response.json()) as {
              roles?: string[];
              nick?: string | null;
              user?: {
                id?: string;
                username?: string;
                avatar?: string | null;
                global_name?: string | null;
              };
              avatar?: string | null;
            };

            const roles = member.roles ?? [];
            const appRoles = getRolesFromDiscordRoles(roles);

            token.roles = appRoles;
            token.role = appRoles.includes("management")
              ? "management"
              : appRoles.includes("employee")
              ? "employee"
              : "unauthorized";

            const discordId = member.user?.id ?? null;
            const username = member.user?.username ?? null;
            const nickname =
              member.nick ??
              member.user?.global_name ??
              member.user?.username ??
              null;

            token.discordId = discordId;
            token.username = username;
            token.nickname = nickname;

            if (member.avatar && discordId) {
              token.avatar = `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${discordId}/avatars/${member.avatar}.png`;
            } else if (member.user?.avatar && discordId) {
              token.avatar = `https://cdn.discordapp.com/avatars/${discordId}/${member.user.avatar}.png`;
            } else {
              token.avatar = null;
            }
          } else {
            token.roles = [];
            token.role = "unauthorized";
          }
        } catch {
          token.roles = [];
          token.role = "unauthorized";
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token.role as string) ?? "unauthorized";
        (session.user as any).roles = (token.roles as string[]) ?? [];
        (session.user as any).nickname = (token.nickname as string | null) ?? null;
        (session.user as any).avatar = (token.avatar as string | null) ?? null;
        (session.user as any).username = (token.username as string | null) ?? null;
        (session.user as any).discordId = (token.discordId as string | null) ?? null;
      }

      return session;
    },
  },
});