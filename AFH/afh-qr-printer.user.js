// ==UserScript==
// @name         AFH - Available Dogs QR Word Document
// @namespace    https://aforeverhome.org/
// @version      1.1.0
// @description  Create a printable Word document with one QR-code page per available AFH dog
// @author       Hunter Mihalick (PocketDr2026)
// @match        https://aforeverhome.org/available-dogs*
// @match        https://www.aforeverhome.org/available-dogs*
// @require      https://cdn.jsdelivr.net/npm/docx@9.8.1/dist/index.iife.js
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // AFH CONFIGURATION
    // =========================================================================

    const BASE_URL = 'https://aforeverhome.org';
    const GALLERY_URL = `${BASE_URL}/available-dogs/`;

    const SCRIPT_VERSION = '1.1.0';

    // Maximum number of gallery pages we'll ever check.
    // This prevents an infinite loop if the AFH site changes.
    const MAX_PAGES = 100;

    // Small pause between requests so we are gentle on the AFH website.
    const REQUEST_DELAY_MS = 150;

    // =========================================================================
    // CREATE THE AFH BUTTON
    // =========================================================================

    const button = document.createElement('button');

    button.id = 'afh-qr-word-button';
    button.textContent = '🐾 Create QR Word Doc';

    Object.assign(button.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '999999',
        padding: '14px 20px',
        background: '#17365d',
        color: '#ffffff',
        border: '2px solid #ffffff',
        borderRadius: '10px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)'
    });

    button.addEventListener('mouseenter', () => {
        if (!button.disabled) {
            button.style.background = '#244d80';
        }
    });

    button.addEventListener('mouseleave', () => {
        if (!button.disabled) {
            button.style.background = '#17365d';
        }
    });

    document.body.appendChild(button);

    // =========================================================================
    // BUTTON CLICK
    // =========================================================================

    button.addEventListener('click', createWordDocument);

    async function createWordDocument() {
        try {
            setButtonState('Finding available dogs...', true);

            // Make sure our required libraries actually loaded.
            if (typeof docx === 'undefined') {
                throw new Error(
                    'The Word document library did not load. ' +
                    'Please refresh the page and try again.'
                );
            }

            if (typeof qrcode === 'undefined') {
                throw new Error(
                    'The QR code library did not load. ' +
                    'Please refresh the page and try again.'
                );
            }

            // -----------------------------------------------------------------
            // Find every currently available dog.
            // -----------------------------------------------------------------

            const dogIds = await collectAllDogIds();

            if (!dogIds.length) {
                throw new Error(
                    'No available dogs were found on the AFH website.'
                );
            }

            console.log(
                `[AFH QR] Found ${dogIds.length} available dogs.`
            );

            // -----------------------------------------------------------------
            // Read exact name from each dog's profile page.
            // -----------------------------------------------------------------

            const dogs = [];

            for (let i = 0; i < dogIds.length; i++) {
                setButtonState(
                    `Reading dog ${i + 1} of ${dogIds.length}...`,
                    true
                );

                const dog = await getDogDetails(dogIds[i]);

                if (dog) {
                    dogs.push(dog);
                }

                await sleep(REQUEST_DELAY_MS);
            }

            if (!dogs.length) {
                throw new Error(
                    'Dog IDs were found, but their profile information ' +
                    'could not be loaded.'
                );
            }

            // Sort by the exact displayed AFH name.
            dogs.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                    sensitivity: 'base'
                })
            );

            // -----------------------------------------------------------------
            // Build Word document.
            // -----------------------------------------------------------------

            setButtonState(
                `Creating Word document for ${dogs.length} dogs...`,
                true
            );

            await createDocx(dogs);

            setButtonState(
                `✓ Created ${dogs.length} QR pages!`,
                true
            );

            setTimeout(() => {
                setButtonState('🐾 Create QR Word Doc', false);
            }, 4000);

        } catch (error) {
            console.error('[AFH QR] Error:', error);

            alert(
                'AFH QR Word Document\n\n' +
                'There was a problem creating the document.\n\n' +
                (error?.message || error)
            );

            setButtonState('🐾 Create QR Word Doc', false);
        }
    }

    // =========================================================================
    // FIND ALL AVAILABLE DOG IDs
    // =========================================================================

    async function collectAllDogIds() {
        const seenIds = new Set();

        for (let page = 1; page <= MAX_PAGES; page++) {
            setButtonState(
                `Checking available dogs page ${page}...`,
                true
            );

            const url = new URL(GALLERY_URL);

            url.searchParams.set('per_page', '9');
            url.searchParams.set('sort', 'name');
            url.searchParams.set('sort_dir', 'asc');
            url.searchParams.set('page_num', String(page));

            console.log(
                `[AFH QR] Loading gallery page ${page}: ${url}`
            );

            const response = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(
                    `AFH gallery page ${page} returned HTTP ` +
                    `${response.status}.`
                );
            }

            const html = await response.text();

            const parsed = new DOMParser().parseFromString(
                html,
                'text/html'
            );

            const pageIds = extractDogIds(parsed);

            console.log(
                `[AFH QR] Page ${page}:`,
                pageIds
            );

            // No dogs at all = definitely the end.
            if (!pageIds.length) {
                break;
            }

            let newDogsOnThisPage = 0;

            for (const id of pageIds) {
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    newDogsOnThisPage++;
                }
            }

            // AFH may redirect an out-of-range page back to the final
            // page. If every ID was already seen, stop.
            if (newDogsOnThisPage === 0) {
                break;
            }

            await sleep(REQUEST_DELAY_MS);
        }

        return Array.from(seenIds);
    }

    // =========================================================================
    // EXTRACT DOG IDs FROM A GALLERY PAGE
    // =========================================================================

    function extractDogIds(doc) {
        const ids = new Set();

        // AFH gallery links currently use URLs such as:
        //
        // /afh-single?id=28105
        //
        // which redirect to:
        //
        // /afh-single-dog/?id=28105
        //
        // Match both forms so the script keeps working if either appears.

        const links = doc.querySelectorAll('a[href]');

        for (const link of links) {
            const rawHref = link.getAttribute('href');

            if (!rawHref) {
                continue;
            }

            if (
                !rawHref.includes('afh-single') &&
                !rawHref.includes('afh-single-dog')
            ) {
                continue;
            }

            try {
                const url = new URL(rawHref, BASE_URL);

                const id = url.searchParams.get('id');

                if (id && /^\d+$/.test(id)) {
                    ids.add(id);
                }

            } catch (error) {
                console.warn(
                    '[AFH QR] Could not parse dog link:',
                    rawHref
                );
            }
        }

        return Array.from(ids);
    }

    // =========================================================================
    // LOAD A DOG'S PROFILE
    // =========================================================================

    async function getDogDetails(id) {
        const profileUrl =
            `${BASE_URL}/afh-single-dog/?id=${encodeURIComponent(id)}`;

        console.log(
            `[AFH QR] Loading dog ${id}: ${profileUrl}`
        );

        const response = await fetch(profileUrl, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store'
        });

        if (!response.ok) {
            console.warn(
                `[AFH QR] Could not load dog ID ${id}.`
            );

            return {
                id,
                name: `AFH Dog ${id}`,
                url: profileUrl
            };
        }

        const html = await response.text();

        const parsed = new DOMParser().parseFromString(
            html,
            'text/html'
        );

        // AFH currently displays the dog's exact name as the H1.
        const heading = parsed.querySelector('h1');

        let name = heading?.textContent?.trim();

        if (!name) {
            name = `AFH Dog ${id}`;
        }

        // Remove repeated whitespace.
        name = name.replace(/\s+/g, ' ').trim();

        return {
            id,
            name,
            url: profileUrl
        };
    }

    // =========================================================================
    // CREATE QR CODE PNG
    // =========================================================================

    function createQrPng(url) {
        const qr = qrcode(0, 'H');

        qr.addData(url);
        qr.make();

        const moduleCount = qr.getModuleCount();

        // Large modules = crisp printed QR.
        const moduleSize = 12;

        // Standard QR quiet area.
        const quietZone = 4;

        const totalModules =
            moduleCount + (quietZone * 2);

        const canvas = document.createElement('canvas');

        canvas.width = totalModules * moduleSize;
        canvas.height = totalModules * moduleSize;

        const ctx = canvas.getContext('2d');

        // White background.
        ctx.fillStyle = '#ffffff';

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        // QR squares.
        ctx.fillStyle = '#000000';

        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        (col + quietZone) * moduleSize,
                        (row + quietZone) * moduleSize,
                        moduleSize,
                        moduleSize
                    );
                }
            }
        }

        return dataUrlToUint8Array(
            canvas.toDataURL('image/png')
        );
    }

    // =========================================================================
    // CREATE CARTOON DOG PNG
    // =========================================================================

    function createCartoonDogPng(
        mainColor = '#D9A15F',
        earColor = '#7D4E2D'
    ) {
        const canvas = document.createElement('canvas');

        canvas.width = 500;
        canvas.height = 380;

        const ctx = canvas.getContext('2d');

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        // ---------------------------------------------------------------------
        // Little paw prints
        // ---------------------------------------------------------------------

        drawPaw(ctx, 55, 65, 0.75, '#D8C6AE', -0.25);
        drawPaw(ctx, 440, 70, 0.65, '#D8C6AE', 0.25);

        // ---------------------------------------------------------------------
        // Ears
        // ---------------------------------------------------------------------

        ctx.fillStyle = earColor;

        ctx.beginPath();
        ctx.ellipse(
            135,
            145,
            62,
            100,
            -0.45,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(
            365,
            145,
            62,
            100,
            0.45,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Head
        // ---------------------------------------------------------------------

        ctx.fillStyle = mainColor;

        ctx.beginPath();
        ctx.ellipse(
            250,
            185,
            150,
            135,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Inner ears
        // ---------------------------------------------------------------------

        ctx.fillStyle = '#EBC8A4';

        ctx.beginPath();
        ctx.ellipse(
            137,
            147,
            31,
            58,
            -0.45,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(
            363,
            147,
            31,
            58,
            0.45,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Eyes
        // ---------------------------------------------------------------------

        ctx.fillStyle = '#2A211C';

        ctx.beginPath();
        ctx.arc(
            200,
            175,
            13,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
            300,
            175,
            13,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Eye highlights.
        ctx.fillStyle = '#ffffff';

        ctx.beginPath();
        ctx.arc(
            196,
            171,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
            296,
            171,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Muzzle
        // ---------------------------------------------------------------------

        ctx.fillStyle = '#F6E4CF';

        ctx.beginPath();
        ctx.ellipse(
            250,
            235,
            70,
            52,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Nose
        // ---------------------------------------------------------------------

        ctx.fillStyle = '#2A211C';

        ctx.beginPath();

        ctx.moveTo(250, 208);
        ctx.bezierCurveTo(
            228,
            205,
            220,
            217,
            224,
            229
        );
        ctx.bezierCurveTo(
            230,
            244,
            270,
            244,
            276,
            229
        );
        ctx.bezierCurveTo(
            280,
            217,
            272,
            205,
            250,
            208
        );

        ctx.fill();

        // ---------------------------------------------------------------------
        // Mouth
        // ---------------------------------------------------------------------

        ctx.strokeStyle = '#2A211C';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(250, 240);
        ctx.lineTo(250, 253);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(250, 253);
        ctx.quadraticCurveTo(
            230,
            272,
            210,
            256
        );
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(250, 253);
        ctx.quadraticCurveTo(
            270,
            272,
            290,
            256
        );
        ctx.stroke();

        // ---------------------------------------------------------------------
        // Tongue
        // ---------------------------------------------------------------------

        ctx.fillStyle = '#F38A96';

        ctx.beginPath();
        ctx.ellipse(
            250,
            278,
            22,
            28,
            0,
            0,
            Math.PI
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Cheeks
        // ---------------------------------------------------------------------

        ctx.fillStyle = 'rgba(247, 148, 148, 0.38)';

        ctx.beginPath();
        ctx.arc(
            175,
            235,
            22,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
            325,
            235,
            22,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // ---------------------------------------------------------------------
        // Collar
        // ---------------------------------------------------------------------

        ctx.fillStyle = '#315A84';

        ctx.beginPath();

        ctx.roundRect(
            180,
            305,
            140,
            28,
            14
        );

        ctx.fill();

        // Collar tag.
        ctx.fillStyle = '#F3C64E';

        ctx.beginPath();
        ctx.arc(
            250,
            337,
            18,
            0,
            Math.PI * 2
        );
        ctx.fill();

        return dataUrlToUint8Array(
            canvas.toDataURL('image/png')
        );
    }

    // =========================================================================
    // DRAW PAW
    // =========================================================================

    function drawPaw(
        ctx,
        x,
        y,
        scale,
        color,
        rotation = 0
    ) {
        ctx.save();

        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);

        ctx.fillStyle = color;

        // Main paw pad.
        ctx.beginPath();
        ctx.ellipse(
            0,
            15,
            24,
            20,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Toes.
        const toes = [
            [-24, -12],
            [-8, -24],
            [10, -24],
            [26, -10]
        ];

        for (const [toeX, toeY] of toes) {
            ctx.beginPath();

            ctx.ellipse(
                toeX,
                toeY,
                10,
                13,
                0,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }

        ctx.restore();
    }

    // =========================================================================
    // CONVERT CANVAS DATA URL TO BYTE ARRAY
    // =========================================================================

    function dataUrlToUint8Array(dataUrl) {
        const base64 = dataUrl.split(',')[1];

        const binaryString = atob(base64);

        const bytes = new Uint8Array(
            binaryString.length
        );

        for (
            let i = 0;
            i < binaryString.length;
            i++
        ) {
            bytes[i] =
                binaryString.charCodeAt(i);
        }

        return bytes;
    }

    // =========================================================================
    // CREATE WORD DOCUMENT
    // =========================================================================

    async function createDocx(dogs) {
        const {
            Document,
            Paragraph,
            TextRun,
            ImageRun,
            PageBreak,
            AlignmentType,
            Packer
        } = docx;

        const children = [];

        // Different little cartoon dog colors.
        const dogPalettes = [
            {
                main: '#D9A15F',
                ears: '#7D4E2D'
            },
            {
                main: '#D6D2CC',
                ears: '#6D625A'
            },
            {
                main: '#E9C38F',
                ears: '#9A643D'
            },
            {
                main: '#C89262',
                ears: '#613E29'
            },
            {
                main: '#F0D0AC',
                ears: '#AE744E'
            },
            {
                main: '#B9A48F',
                ears: '#645346'
            }
        ];

        for (
            let index = 0;
            index < dogs.length;
            index++
        ) {
            const dog = dogs[index];

            const palette =
                dogPalettes[
                    index % dogPalettes.length
                ];

            const cartoonDog =
                createCartoonDogPng(
                    palette.main,
                    palette.ears
                );

            const qrImage =
                createQrPng(dog.url);

            // -----------------------------------------------------------------
            // AFH heading
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        before: 80,
                        after: 80
                    },

                    children: [
                        new TextRun({
                            text:
                                'A FOREVER HOME RESCUE FOUNDATION',
                            bold: true,
                            size: 22,
                            color: '17365D'
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // Cartoon dog
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        before: 40,
                        after: 80
                    },

                    children: [
                        new ImageRun({
                            type: 'png',
                            data: cartoonDog,

                            transformation: {
                                width: 150,
                                height: 114
                            },

                            altText: {
                                name:
                                    'Cartoon Dog',
                                title:
                                    'Cartoon Dog',
                                description:
                                    'Decorative cartoon dog'
                            }
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // DOG / LITTER NAME
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        before: 20,
                        after: 180
                    },

                    children: [
                        new TextRun({
                            text: dog.name,
                            bold: true,
                            size: 52,
                            color: '000000'
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // QR CODE
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        before: 20,
                        after: 150
                    },

                    children: [
                        new ImageRun({
                            type: 'png',
                            data: qrImage,

                            transformation: {
                                width: 300,
                                height: 300
                            },

                            altText: {
                                name:
                                    `${dog.name} QR Code`,
                                title:
                                    `${dog.name} QR Code`,
                                description:
                                    `QR code for ${dog.url}`
                            }
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // SCAN INSTRUCTIONS
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        before: 40,
                        after: 60
                    },

                    children: [
                        new TextRun({
                            text:
                                'Scan to learn more about me!',
                            bold: true,
                            size: 30,
                            color: '17365D'
                        })
                    ]
                })
            );

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        after: 50
                    },

                    children: [
                        new TextRun({
                            text:
                                'View my photos, description, and adoption information.',
                            size: 21,
                            color: '444444'
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // AFH URL
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    spacing: {
                        before: 20,
                        after: 40
                    },

                    children: [
                        new TextRun({
                            text:
                                'aforeverhome.org',
                            bold: true,
                            size: 20,
                            color: '17365D'
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // SMALL DOG ID FOR TROUBLESHOOTING
            //
            // Tiny enough that it doesn't distract from the sign,
            // but useful if we ever need to verify a QR later.
            // -----------------------------------------------------------------

            children.push(
                new Paragraph({
                    alignment:
                        AlignmentType.CENTER,

                    children: [
                        new TextRun({
                            text:
                                `AFH Dog ID: ${dog.id}`,
                            size: 14,
                            color: '999999'
                        })
                    ]
                })
            );

            // -----------------------------------------------------------------
            // PAGE BREAK
            // -----------------------------------------------------------------

            if (index < dogs.length - 1) {
                children.push(
                    new Paragraph({
                        children: [
                            new PageBreak()
                        ]
                    })
                );
            }
        }

        // ---------------------------------------------------------------------
        // LETTER-SIZE WORD DOCUMENT
        // ---------------------------------------------------------------------

        const wordDocument =
            new Document({
                creator:
                    'Hunter Mihalick (PocketDr2026)',

                title:
                    'AFH Available Dogs QR Codes',

                description:
                    'Printable QR code pages for currently available dogs at A Forever Home Rescue Foundation.',

                sections: [
                    {
                        properties: {
                            page: {
                                size: {
                                    // US Letter:
                                    // 8.5 x 11 inches
                                    width: 12240,
                                    height: 15840
                                },

                                margin: {
                                    top: 400,
                                    bottom: 400,
                                    left: 500,
                                    right: 500
                                }
                            }
                        },

                        children
                    }
                ]
            });

        const blob =
            await Packer.toBlob(
                wordDocument
            );

        const today =
            getLocalDateString();

        downloadBlob(
            blob,
            `AFH-Available-Dogs-QR-Codes-${today}.docx`
        );
    }

    // =========================================================================
    // DOWNLOAD FILE
    // =========================================================================

    function downloadBlob(blob, filename) {
        const objectUrl =
            URL.createObjectURL(blob);

        const link =
            document.createElement('a');

        link.href = objectUrl;
        link.download = filename;

        link.style.display = 'none';

        document.body.appendChild(link);

        link.click();

        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(
                objectUrl
            );
        }, 5000);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function setButtonState(text, disabled) {
        button.textContent = text;
        button.disabled = disabled;

        if (disabled) {
            button.style.opacity = '0.82';
            button.style.cursor = 'wait';
        } else {
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
            button.style.background = '#17365d';
        }
    }

    function sleep(ms) {
        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }

    function getLocalDateString() {
        const now = new Date();

        const year =
            now.getFullYear();

        const month =
            String(
                now.getMonth() + 1
            ).padStart(2, '0');

        const day =
            String(
                now.getDate()
            ).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    // =========================================================================
    // STARTUP MESSAGE
    // =========================================================================

    console.log(
        `%cAFH QR Word Generator v${SCRIPT_VERSION} loaded.`,
        'color:#17365d;font-weight:bold;font-size:14px;'
    );

})();
