
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as Blob;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const OCR_URL = process.env.NAVER_OCR_URL;
        const OCR_KEY = process.env.NAVER_OCR_KEY;

        if (!OCR_URL || !OCR_KEY) {
            return NextResponse.json({
                mock: true,
                amount: 15000,
                date: '2024-05-25',
                storeName: '테스트 식당'
            });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const base64Image = buffer.toString('base64');
        const format = file.type === 'image/png' ? 'png' : 'jpg';

        const payload = {
            version: 'V2',
            requestId: crypto.randomUUID(),
            timestamp: Date.now(),
            images: [
                {
                    format: format,
                    name: 'receipt',
                    data: base64Image
                }
            ]
        };

        const response = await fetch(OCR_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-OCR-SECRET': OCR_KEY
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("OCR Error:", result);
            return NextResponse.json({ error: 'OCR Failed' }, { status: 500 });
        }

        // Parse Naver OCR Result
        let w_text = "분석 결과";
        let w_amount = 0;
        let w_date = "";
        let debugText = "";

        if (result.images && result.images[0].fields) {
            const fields = result.images[0].fields;

            // 1. Construct Full Text for Debugging
            const allText = fields.map((f: any) => f.inferText);
            debugText = allText.join(' ');
            w_text = allText.slice(0, 3).join(' ') + "...";

            // 2. Find Date
            const dateField = fields.find((f: any) => /\d{4}[-./]\d{2}[-./]\d{2}/.test(f.inferText));
            if (dateField) w_date = dateField.inferText;

            // 3. Smart Amount Finding
            const candidates = fields.map((f: any, i: number) => ({
                text: f.inferText,
                index: i,
                isNumber: /^[0-9,]+원?$/.test(f.inferText),
                numberValue: parseInt(f.inferText.replace(/[^0-9]/g, '')) || 0
            }));

            // Strategy A: Keywords
            const keywords = ["합계", "총액", "결제금액", "승인금액", "금액", "카드"];
            let foundAmount = false;

            const clean = (s: string) => s.replace(/\s+/g, '');

            for (const kw of keywords) {
                const kwIdx = candidates.findIndex((c: any) => clean(c.text).includes(kw));
                if (kwIdx !== -1) {
                    const neighbors = candidates.slice(kwIdx + 1, kwIdx + 7);

                    const bestNeighbor = neighbors.find((c: any) => c.isNumber && c.numberValue > 0 && (c.text.includes(',') || c.text.includes('원')));
                    const anyNeighbor = neighbors.find((c: any) => c.isNumber && c.numberValue > 0);

                    const amountCand = bestNeighbor || anyNeighbor;

                    if (amountCand) {
                        w_amount = amountCand.numberValue;
                        foundAmount = true;
                        if (kw === "합계" || kw === "총액") break;
                    }
                }
            }

            // Strategy B: Fallback
            if (!foundAmount || w_amount === 0) {
                const numberFields = candidates.filter((c: any) => c.isNumber && c.numberValue > 0);

                const cleanNumbers = numberFields.filter((c: any) => {
                    const raw = c.text.replace(/[^0-9]/g, '');

                    // Rule 0: Exclude near TEL/FAX
                    if (c.index > 0) {
                        const prev = candidates[c.index - 1].text.toUpperCase();
                        if (prev.includes("TEL") || prev.includes("FAX") || prev.includes("전화") || prev.includes("문의") || prev.includes("NO")) return false;
                    }

                    // Rule 1: Starts with 0
                    if (raw.startsWith('0')) return false;

                    // Rule 2: Suspicious Raw Numbers
                    const hasComma = c.text.includes(',');
                    const hasWon = c.text.includes('원');

                    if (c.numberValue >= 10000 && !hasComma && !hasWon) return false;

                    // Rule 3: Date-like
                    if (raw.startsWith('202') && raw.length === 8) return false;

                    return true;
                });

                if (cleanNumbers.length > 0) {
                    const sorted = cleanNumbers.sort((a: any, b: any) => b.numberValue - a.numberValue);
                    w_amount = sorted[0].numberValue;
                }
            }
        }

        return NextResponse.json({
            amount: w_amount,
            date: w_date,
            storeName: w_text,
            debugText: debugText,
            raw: result
        });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
