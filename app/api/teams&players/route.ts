import { NextRequest, NextResponse } from 'next/server';

interface DiscordUser {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
}

interface DiscordGuildMember {
    user: DiscordUser;
    nick?: string;
    avatar?: string;
}

interface DiscordMessage {
    id: string;
    channel_id: string;
    content: string;
    mentions: Array<DiscordUser>;
}

interface DiscordChannel {
    id: string;
    type: number;
    position?: number;
    name?: string;
    last_message_id?: string;
    parent_id?: string;
}

interface ResolvedMemberInfo {
    userId: string | null;
    serverNickname: string | null;
    globalUsername: string | null;
    serverAvatarUrl: string | null;
    avatarUrl: string | null;
}

interface ParsedLeader extends ResolvedMemberInfo {
    role: string;
    rawText: string;
}

interface ParsedPlayer extends ResolvedMemberInfo {
    isMainPlayer: boolean;
    rawText: string;
}

interface ParsedTeam {
    organization: string;
    teamName: string | null;
    division: string | null;
    league: string | null;
    players: ParsedPlayer[];
    substitutes: ParsedPlayer[];
    captains: ParsedPlayer[];
    coaches: ParsedPlayer[];
    managers: ParsedPlayer[];
    link: string | null;
}

interface ParsedMessageData {
    leaders: ParsedLeader[];
    teams: ParsedTeam[];
}

export async function GET(request: NextRequest) {
    const token = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!token || !guildId) {
        return NextResponse.json(
            { error: 'Server configuration error' },
            { status: 500 }
        );
    }

    try {
        const guildMembers = await fetchAllGuildMembers(guildId);

        const memberMap = new Map<string, DiscordGuildMember>();
        guildMembers.forEach((m) => memberMap.set(m.user.id, m));

        const channels = await discordFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`);

        if (!channels || !Array.isArray(channels)) {
            return NextResponse.json(
                { error: 'Failed to retrieve channels from Discord' },
                { status: 500 }
            );
        }

        const targetChannels = channels.filter(
            (channel) =>
                channel.type === 0 &&
                channel.name?.toLowerCase().includes('orga-und-teams')
        );

        const processedChannels = [];

        for (const channel of targetChannels) {
            const gameName = channel.parent_id
                ? channels.find((parent) => parent.id === channel.parent_id)?.name || 'Unknown Game'
                : 'Unknown Game';

            if (!channel.last_message_id) continue;

            const message = await discordFetch<DiscordMessage>(
                `/channels/${channel.id}/messages/${channel.last_message_id}`
            );

            if (!message) continue;

            const parsedData = parseMessageContent(message.content, memberMap, guildId);

            processedChannels.push({
                id: channel.id,
                name: channel.name || 'Unnamed Channel',
                position: channel.position || null,
                game_name: gameName,
                message_content: message.content,
                parsed_data: parsedData,
            });
        }

        processedChannels.sort((a, b) => (a.position || 0) - (b.position || 0));

        return NextResponse.json(processedChannels, {
            headers: {
                'cache-control': 'public, max-age=1209600, s-maxage=1209600, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        console.error('Error found while fetching Discord Guild: ', error);
        return NextResponse.json(
            { error: 'Error found while fetching Discord Guild' },
            { status: 500 }
        );
    }
}

export async function discordFetch<T>(endpoint: string, maxRetries: number = 3): Promise<T | null> {
    if (maxRetries <= 0) {
        console.error(`[Discord API] Max retries reached for endpoint: ${endpoint}`);
        return null;
    }

    const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
        method: 'GET',
        headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
        },
        next: { revalidate: 60 },
    });

    if (response.status === 429) {
        const data = await response.json();
        const retryAfter = data.retry_after || 1;
        const isGlobal = data.global || false;

        console.warn(
            `[Discord API] Rate limited on ${endpoint}. ${
                isGlobal ? 'GLOBAL' : 'Route'
            } limit hit. Retrying in ${retryAfter}s...`
        );
    }

    const remaining = response.headers.get('X-RateLimit-Remaining');
    const resetAfter = response.headers.get('X-RateLimit-Reset-After');

    if (remaining !== null && parseInt(remaining, 10) <= 0 && resetAfter !== null) {
        const waitTimeSeconds = parseFloat(resetAfter);
        console.warn(
            `[Discord API] Rate limit bucket exhausted. Pausing requests for ${waitTimeSeconds}s.`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTimeSeconds * 1000));
    }

    return (await response.json()) as T;
}

async function fetchAllGuildMembers(guildId: string): Promise<DiscordGuildMember[]> {
    let allMembers: DiscordGuildMember[] = [];
    let lastMemberId = '0';
    let hasMore = true;

    while (hasMore) {
        const chunk = await discordFetch<DiscordGuildMember[]>(
            `/guilds/${guildId}/members?limit=1000&after=${lastMemberId}`
        );

        if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
            hasMore = false;
        } else {
            allMembers = allMembers.concat(chunk);
            lastMemberId = chunk[chunk.length - 1].user.id;

            if (chunk.length < 1000) {
                hasMore = false;
            }
        }
    }

    return allMembers;
}

function parseMessageContent(
    content: string,
    memberMap: Map<string, DiscordGuildMember>,
    guildId: string
): ParsedMessageData {
    const normalizedContent = content.normalize('NFKD');

    const lines = normalizedContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    const leaders: ParsedLeader[] = [];
    const teams: ParsedTeam[] = [];

    let currentLeague: string | null = null;
    let currentTeam: ParsedTeam | null = null;

    const extractMentionId = (text: string): string | null => {
        const match = text.match(/<@!?(\d+)>/);
        return match ? match[1] : null;
    };

    const hasEmojiPrefix = (line: string): boolean => {
        return /^(<a?:[\w_]+:\d+>|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/u.test(line);
    };

    const resolveMember = (userId: string | null): ResolvedMemberInfo => {
        if (!userId) {
            return {
                userId: null,
                serverNickname: null,
                globalUsername: null,
                serverAvatarUrl: null,
                avatarUrl: null,
            };
        }

        const member = memberMap.get(userId);
        if (!member) {
            return {
                userId,
                serverNickname: null,
                globalUsername: null,
                serverAvatarUrl: null,
                avatarUrl: null,
            };
        }

        return {
            userId: member.user.id,
            serverNickname: member.nick || member.user.global_name || member.user.username,
            globalUsername: member.user.username,
            serverAvatarUrl: member.avatar
                ? `https://cdn.discordapp.com/guilds/${guildId}/users/${member.user.id}/avatars/${member.avatar}.png`
                : null,
            avatarUrl: member.user.avatar
                ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
                : null,
        };
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('【') && line.includes('】')) {
            const rawHeader = line.replace(/[【】﻿]/g, '').trim();

            if (!rawHeader.toLowerCase().includes('bereichsleitung')) {
                currentLeague = rawHeader;
            }
            continue;
        }

        if (line.toLowerCase().includes('bereichsleiter')) {
            const isSub = line.toLowerCase().includes('stellv');
            const userId = extractMentionId(line);
            const memberInfo = resolveMember(userId);

            leaders.push({
                ...memberInfo,
                role: isSub ? 'Stellv. Bereichsleiter' : 'Bereichsleiter',
                rawText: line,
            });
            continue;
        }

        if (line.toUpperCase().includes('ENGINES STUTTGART')) {
            if (currentTeam) teams.push(currentTeam);

            const parts = line.split('-').map((p) => p.trim());
            const org = parts[0];
            const name = parts.length > 1 ? parts.slice(1).join(' - ') : null;

            let division: string | null = null;
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                if (
                    !nextLine.includes('【') &&
                    !nextLine.toLowerCase().includes('substitute') &&
                    !nextLine.toLowerCase().includes('coach') &&
                    !nextLine.toLowerCase().includes('manager') &&
                    !nextLine.toLowerCase().includes('captain') &&
                    !nextLine.toLowerCase().includes('link:') &&
                    !extractMentionId(nextLine)
                ) {
                    division = nextLine;
                    i++; 
                }
            }

            currentTeam = {
                organization: org,
                teamName: name,
                division: division,
                league: currentLeague,
                players: [],
                substitutes: [],
                captains: [],
                coaches: [],
                managers: [],
                link: null,
            };
            continue;
        }

        if (currentTeam) {
            const userId = extractMentionId(line);
            const lowerLine = line.toLowerCase();
            const memberInfo = resolveMember(userId);

            if (lowerLine.startsWith('link:')) {
                const urlMatch = line.match(/https?:\/\/[^\s]+/);
                currentTeam.link = urlMatch ? urlMatch[0] : null;
            } else if (lowerLine.includes('substitute:')) {
                currentTeam.substitutes.push({ ...memberInfo, isMainPlayer: false, rawText: line });
            } else if (lowerLine.includes('captain:')) {
                currentTeam.captains.push({ ...memberInfo, isMainPlayer: false, rawText: line });
            } else if (lowerLine.includes('coach:')) {
                currentTeam.coaches.push({ ...memberInfo, isMainPlayer: false, rawText: line });
            } else if (lowerLine.includes('manager:')) {
                currentTeam.managers.push({ ...memberInfo, isMainPlayer: false, rawText: line });
            } else if (userId || line.includes('@')) {
                const isMain = hasEmojiPrefix(line);
                currentTeam.players.push({ ...memberInfo, isMainPlayer: isMain, rawText: line });
            }
        }
    }

    if (currentTeam) {
        teams.push(currentTeam);
    }

    return { leaders, teams };
}