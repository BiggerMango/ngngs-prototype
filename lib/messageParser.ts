import { DiscordGuildMember } from "./discord";

export interface ResolvedMemberInfo {
    userId: string | null;
    serverNickname: string | null;
    globalUsername: string | null;
    serverAvatarUrl: string | null;
    avatarUrl: string | null;
}

export interface ParsedLeader extends ResolvedMemberInfo {
    role: string;
    rawText: string;
}

export interface ParsedPlayer extends ResolvedMemberInfo {
    isMainPlayer: boolean;
    rawText: string;
}

export interface ParsedTeam {
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

export interface ParsedMessageData {
    leaders: ParsedLeader[];
    teams: ParsedTeam[];
}



export function parseMessageContent(
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