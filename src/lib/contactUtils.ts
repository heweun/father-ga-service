
export interface ExtractedContact {
    name: string;
    phone: string;
    originalText: string;
}

export function extractContacts(text: string): ExtractedContact[] {
    const lines = text.split('\n');
    const results: ExtractedContact[] = [];

    // Regex for 010-XXXX-XXXX or 010XXXXXXXX formats
    // Also relaxed to allow dots or spaces separator
    const phoneRegex = /(01[016789])[-. ]?(\d{3,4})[-. ]?(\d{4})/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(phoneRegex);
        if (match) {
            const phone = match[0].replace(/[-. ]/g, ''); // Normalize to 01012345678

            // Attempt to guess name: Remove the phone part, trim, and what's left is likely the name
            // This works well for "Hong Gil Dong 010-1234-5678" format
            let nameCandidate = trimmed.replace(match[0], '').trim();

            // Clean up common separators like colon, comma
            nameCandidate = nameCandidate.replace(/^[:,\- ]+|[:,\- ]+$/g, '');

            // Fallback if empty
            if (!nameCandidate) {
                nameCandidate = "이름없음";
            }

            results.push({
                name: nameCandidate,
                phone: phone,
                originalText: trimmed
            });
        }
    }

    return results;
}
