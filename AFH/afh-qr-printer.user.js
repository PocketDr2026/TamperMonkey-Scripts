// ==UserScript==
// @name         AFH - Available Dogs QR PDF Printer
// @namespace    https://aforeverhome.org/
// @version      1.2.0
// @description  Create printable AFH dog and puppy-litter PDF signs with QR codes
// @author       Hunter Mihalick (PocketDr2026) Leslie Bloxam
// @homepageURL  https://github.com/PocketDr2026/TamperMonkey-Scripts
// @supportURL   https://github.com/PocketDr2026/TamperMonkey-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/PocketDr2026/TamperMonkey-Scripts/main/AFH/afh-qr-printer.user.js
// @downloadURL  https://raw.githubusercontent.com/PocketDr2026/TamperMonkey-Scripts/main/AFH/afh-qr-printer.user.js
// @match        https://aforeverhome.org/available-dogs*
// @match        https://www.aforeverhome.org/available-dogs*
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // CONFIG
    // =========================================================================

    const BASE_URL = 'https://aforeverhome.org';
    const GALLERY_URL = `${BASE_URL}/available-dogs/`;

    const VERSION = '1.2.0';

    const MAX_PAGES = 100;
    const REQUEST_DELAY = 150;

    // PDF: US Letter landscape
    // 11in x 8.5in
    const PAGE_WIDTH = 792;
    const PAGE_HEIGHT = 612;

    const DARK = [20, 20, 20];
    const GRAY = [145, 145, 145];
    const LIGHT_GRAY = [205, 205, 205];

    // =========================================================================
    // BUTTON
    // =========================================================================

    const button = document.createElement('button');

    button.id = 'afh-qr-pdf-button';
    button.textContent = '🐾 Create AFH Signs PDF';

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

    document.body.appendChild(button);

    button.addEventListener('click', createPdf);

    // =========================================================================
    // MAIN
    // =========================================================================

    async function createPdf() {
        try {
            setButton('Finding available dogs...', true);

            if (
                !window.jspdf ||
                !window.jspdf.jsPDF
            ) {
                throw new Error(
                    'The PDF library did not load. Refresh the page and try again.'
                );
            }

            if (typeof qrcode === 'undefined') {
                throw new Error(
                    'The QR library did not load. Refresh the page and try again.'
                );
            }

            const dogs = await collectAllDogs();

            if (!dogs.length) {
                throw new Error(
                    'No available dogs were found.'
                );
            }

            setButton(
                `Organizing ${dogs.length} dogs...`,
                true
            );

            const pages = buildPages(dogs);

            setButton(
                `Creating ${pages.length} PDF pages...`,
                true
            );

            await generatePdf(pages);

            setButton(
                `✓ Created ${pages.length} pages!`,
                true
            );

            setTimeout(() => {
                setButton(
                    '🐾 Create AFH Signs PDF',
                    false
                );
            }, 4000);

        } catch (error) {
            console.error(
                '[AFH PDF]',
                error
            );

            alert(
                'AFH Sign Generator\n\n' +
                'There was a problem creating the PDF.\n\n' +
                (error?.message || error)
            );

            setButton(
                '🐾 Create AFH Signs PDF',
                false
            );
        }
    }

    // =========================================================================
    // COLLECT ALL DOGS
    // =========================================================================

    async function collectAllDogs() {
        const dogsById = new Map();

        for (
            let page = 1;
            page <= MAX_PAGES;
            page++
        ) {
            setButton(
                `Checking dogs page ${page}...`,
                true
            );

            const url = new URL(
                GALLERY_URL
            );

            url.searchParams.set(
                'per_page',
                '9'
            );

            url.searchParams.set(
                'sort',
                'name'
            );

            url.searchParams.set(
                'sort_dir',
                'asc'
            );

            url.searchParams.set(
                'page_num',
                String(page)
            );

            const response =
                await fetch(
                    url.toString(),
                    {
                        credentials:
                            'same-origin',
                        cache:
                            'no-store'
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Gallery page ${page} returned HTTP ${response.status}.`
                );
            }

            const html =
                await response.text();

            const doc =
                new DOMParser()
                    .parseFromString(
                        html,
                        'text/html'
                    );

            const pageDogs =
                extractDogsFromGallery(
                    doc
                );

            if (!pageDogs.length) {
                break;
            }

            let newDogs = 0;

            for (
                const dog of pageDogs
            ) {
                if (
                    !dogsById.has(
                        dog.id
                    )
                ) {
                    dogsById.set(
                        dog.id,
                        dog
                    );

                    newDogs++;
                }
            }

            if (newDogs === 0) {
                break;
            }

            await sleep(
                REQUEST_DELAY
            );
        }

        const dogs =
            Array.from(
                dogsById.values()
            );

        dogs.sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    {
                        sensitivity:
                            'base'
                    }
                )
        );

        console.table(dogs);

        return dogs;
    }

    // =========================================================================
    // PARSE GALLERY
    // =========================================================================

    function extractDogsFromGallery(doc) {
        const results = [];

        const links =
            Array.from(
                doc.querySelectorAll(
                    'a[href]'
                )
            );

        for (
            const link of links
        ) {
            const href =
                link.getAttribute(
                    'href'
                );

            if (!href) {
                continue;
            }

            if (
                !href.includes(
                    'afh-single'
                )
            ) {
                continue;
            }

            let parsedUrl;

            try {
                parsedUrl =
                    new URL(
                        href,
                        BASE_URL
                    );
            } catch {
                continue;
            }

            const id =
                parsedUrl
                    .searchParams
                    .get('id');

            if (
                !id ||
                !/^\d+$/.test(id)
            ) {
                continue;
            }

            // Walk upward until we find the card/container
            // containing the listing's descriptive text.
            const container =
                findDogCard(link);

            const text =
                normalizeText(
                    container
                        ?.innerText ||
                    link.parentElement
                        ?.innerText ||
                    link.innerText ||
                    ''
                );

            const dog =
                parseDogCard(
                    id,
                    text
                );

            if (dog) {
                results.push(dog);
            }
        }

        return dedupeById(
            results
        );
    }

    function findDogCard(link) {
        let current = link;

        for (
            let i = 0;
            i < 8 && current;
            i++
        ) {
            const text =
                normalizeText(
                    current.innerText ||
                    ''
                );

            if (
                /Born\s+\d{1,2}\/\d{1,2}\/\d{4}/i
                    .test(text) &&
                /(Male|Female)/i
                    .test(text)
            ) {
                return current;
            }

            current =
                current.parentElement;
        }

        return link.parentElement;
    }

    // =========================================================================
    // PARSE DOG CARD
    // =========================================================================

    function parseDogCard(
        id,
        text
    ) {
        if (!text) {
            return null;
        }

        const cleaned =
            text
                .replace(
                    /Click for details/gi,
                    ''
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        const bornMatch =
            cleaned.match(
                /Born\s+(\d{1,2}\/\d{1,2}\/\d{4})/i
            );

        const sexMatch =
            cleaned.match(
                /\b(Male|Female)\b(?:\s*\([^)]+\))?/i
            );

        if (
            !bornMatch ||
            !sexMatch
        ) {
            return null;
        }

        const birthDate =
            bornMatch[1];

        const sex =
            capitalize(
                sexMatch[1]
            );

        // Everything before the breed/sex/date block
        // generally begins with the name.
        //
        // We get a cleaner parse by locating the
        // sex text and working backward.

        const sexIndex =
            cleaned.search(
                /\b(Male|Female)\b/i
            );

        const beforeSex =
            cleaned
                .slice(
                    0,
                    sexIndex
                )
                .trim();

        // Use heading text when available.
        // Gallery cards normally expose the name first.

        const pieces =
            beforeSex
                .split(/\s+/);

        let bestName = '';
        let bestBreed = '';

        // Known breed endings make this easier.
        const breedWords = [
            'Mix',
            'Purebred',
            'Terrier',
            'Retriever',
            'Beagle',
            'Boxer',
            'Hound',
            'Shepherd',
            'Spaniel',
            'Bulldog',
            'Chihuahua',
            'Feist',
            'Schnauzer',
            'Collie'
        ];

        for (
            let i = 1;
            i < pieces.length;
            i++
        ) {
            const candidateBreed =
                pieces
                    .slice(i)
                    .join(' ');

            if (
                breedWords.some(
                    word =>
                        candidateBreed
                            .includes(word)
                )
            ) {
                bestName =
                    pieces
                        .slice(0, i)
                        .join(' ');

                bestBreed =
                    candidateBreed;

                break;
            }
        }

        if (!bestName) {
            // Fallback:
            // first heading-like phrase becomes name.
            bestName =
                pieces
                    .slice(
                        0,
                        Math.max(
                            1,
                            pieces.length - 2
                        )
                    )
                    .join(' ');

            bestBreed =
                pieces
                    .slice(
                        Math.max(
                            1,
                            pieces.length - 2
                        )
                    )
                    .join(' ');
        }

        const profileUrl =
            `${BASE_URL}/afh-single-dog/?id=${encodeURIComponent(id)}`;

        return {
            id,
            name:
                normalizeText(
                    bestName
                ),
            breed:
                normalizeText(
                    bestBreed
                ),
            sex,
            birthDate,
            profileUrl
        };
    }

    // =========================================================================
    // BUILD SINGLE-DOG / LITTER PAGES
    // =========================================================================

    function buildPages(dogs) {
        const groups =
            new Map();

        // Candidate litter key:
        // remove the final word from names.
        //
        // Example:
        // "Adorable Labs Roy"
        // "Adorable Labs Zorro"
        //
        // both become:
        // "Adorable Labs"

        for (
            const dog of dogs
        ) {
            const words =
                dog.name
                    .trim()
                    .split(/\s+/);

            const prefix =
                words.length >= 2
                    ? words
                        .slice(
                            0,
                            -1
                        )
                        .join(' ')
                    : '';

            if (!prefix) {
                continue;
            }

            if (
                !groups.has(prefix)
            ) {
                groups.set(
                    prefix,
                    []
                );
            }

            groups
                .get(prefix)
                .push(dog);
        }

        const used =
            new Set();

        const pages = [];

        // Only create a litter page
        // when at least TWO dogs share the prefix.

        for (
            const [prefix, members]
            of groups.entries()
        ) {
            if (
                members.length < 2
            ) {
                continue;
            }

            // Avoid grouping dogs unless their
            // breed and birth date also match.
            const first =
                members[0];

            const matching =
                members.filter(
                    dog =>
                        dog.birthDate ===
                            first.birthDate &&
                        dog.breed ===
                            first.breed
                );

            if (
                matching.length < 2
            ) {
                continue;
            }

            matching.sort(
                (a, b) =>
                    getPuppyName(a, prefix)
                        .localeCompare(
                            getPuppyName(
                                b,
                                prefix
                            )
                        )
            );

            pages.push({
                type: 'litter',
                litterName:
                    prefix,
                breed:
                    first.breed,
                birthDate:
                    first.birthDate,
                dogs:
                    matching
            });

            matching.forEach(
                dog =>
                    used.add(dog.id)
            );
        }

        // Remaining dogs get individual pages.
        for (
            const dog of dogs
        ) {
            if (
                used.has(dog.id)
            ) {
                continue;
            }

            pages.push({
                type: 'single',
                dog
            });
        }

        pages.sort(
            (a, b) => {
                const nameA =
                    a.type === 'litter'
                        ? a.litterName
                        : a.dog.name;

                const nameB =
                    b.type === 'litter'
                        ? b.litterName
                        : b.dog.name;

                return nameA
                    .localeCompare(
                        nameB
                    );
            }
        );

        return pages;
    }

    // =========================================================================
    // PDF
    // =========================================================================

    async function generatePdf(
        pages
    ) {
        const {
            jsPDF
        } = window.jspdf;

        const pdf =
            new jsPDF({
                orientation:
                    'landscape',
                unit:
                    'pt',
                format:
                    'letter',
                compress:
                    true
            });

        for (
            let i = 0;
            i < pages.length;
            i++
        ) {
            if (i > 0) {
                pdf.addPage(
                    'letter',
                    'landscape'
                );
            }

            const page =
                pages[i];

            if (
                page.type ===
                'litter'
            ) {
                drawLitterPage(
                    pdf,
                    page
                );
            } else {
                drawSingleDogPage(
                    pdf,
                    page.dog
                );
            }
        }

        const date =
            getLocalDateString();

        pdf.save(
            `AFH-Available-Dogs-Signs-${date}.pdf`
        );
    }

    // =========================================================================
    // SINGLE DOG PAGE
    // =========================================================================

    function drawSingleDogPage(
        pdf,
        dog
    ) {
        drawBackground(pdf);

        // ------------------------------------------------------------
        // NAME
        // ------------------------------------------------------------

        pdf.setTextColor(
            ...DARK
        );

        pdf.setFont(
            'times',
            'bold'
        );

        let nameSize = 60;

        if (
            dog.name.length > 22
        ) {
            nameSize = 48;
        }

        if (
            dog.name.length > 32
        ) {
            nameSize = 40;
        }

        pdf.setFontSize(
            nameSize
        );

        pdf.text(
            dog.name,
            PAGE_WIDTH / 2,
            118,
            {
                align:
                    'center'
            }
        );

        // ------------------------------------------------------------
        // BREED
        // ------------------------------------------------------------

        pdf.setFont(
            'helvetica',
            'normal'
        );

        pdf.setFontSize(
            fitFontSize(
                pdf,
                dog.breed,
                32,
                460,
                20
            )
        );

        pdf.text(
            dog.breed,
            PAGE_WIDTH / 2,
            212,
            {
                align:
                    'center'
            }
        );

        // ------------------------------------------------------------
        // SEX
        // ------------------------------------------------------------

        pdf.setFontSize(31);

        pdf.text(
            dog.sex.toLowerCase(),
            PAGE_WIDTH / 2,
            264,
            {
                align:
                    'center'
            }
        );

        // ------------------------------------------------------------
        // BIRTH DATE
        // ------------------------------------------------------------

        pdf.setFontSize(31);

        pdf.text(
            `born ${formatBirthDate(dog.birthDate)}`,
            PAGE_WIDTH / 2,
            321,
            {
                align:
                    'center'
            }
        );

        // ------------------------------------------------------------
        // QR
        // ------------------------------------------------------------

        const qr =
            createQrDataUrl(
                dog.profileUrl
            );

        pdf.addImage(
            qr,
            'PNG',
            318,
            360,
            156,
            156
        );

        pdf.setFontSize(14);

        pdf.setTextColor(
            90,
            90,
            90
        );

        pdf.text(
            'Scan to learn more',
            PAGE_WIDTH / 2,
            535,
            {
                align:
                    'center'
            }
        );

        drawAfhFooter(
            pdf
        );
    }

    // =========================================================================
    // LITTER PAGE
    // =========================================================================

    function drawLitterPage(
        pdf,
        page
    ) {
        drawBackground(pdf);

        const dogs =
            page.dogs;

        // ------------------------------------------------------------
        // LITTER NAME
        // ------------------------------------------------------------

        pdf.setTextColor(
            ...DARK
        );

        pdf.setFont(
            'times',
            'bold'
        );

        pdf.setFontSize(
            fitFontSize(
                pdf,
                page.litterName,
                54,
                540,
                36
            )
        );

        pdf.text(
            page.litterName,
            PAGE_WIDTH / 2,
            86,
            {
                align:
                    'center'
            }
        );

        // ------------------------------------------------------------
        // BREED + BORN
        // ------------------------------------------------------------

        pdf.setFont(
            'helvetica',
            'normal'
        );

        pdf.setFontSize(
            fitFontSize(
                pdf,
                page.breed,
                24,
                520,
                17
            )
        );

        pdf.text(
            page.breed,
            PAGE_WIDTH / 2,
            125,
            {
                align:
                    'center'
            }
        );

        pdf.setFontSize(19);

        pdf.text(
            `born ${formatBirthDate(page.birthDate)}`,
            PAGE_WIDTH / 2,
            154,
            {
                align:
                    'center'
            }
        );

        // ------------------------------------------------------------
        // PUPPY GRID
        // ------------------------------------------------------------

        const count =
            dogs.length;

        let columns;

        if (count <= 3) {
            columns = count;
        } else if (
            count <= 6
        ) {
            columns = 3;
        } else {
            columns = 4;
        }

        const rows =
            Math.ceil(
                count /
                columns
            );

        const availableWidth =
            610;

        const startX =
            (PAGE_WIDTH -
                availableWidth) /
            2;

        const cellWidth =
            availableWidth /
            columns;

        const gridTop =
            185;

        const availableHeight =
            325;

        const rowHeight =
            availableHeight /
            rows;

        let qrSize;

        if (rows === 1) {
            qrSize = 132;
        } else if (
            rows === 2
        ) {
            qrSize = 100;
        } else {
            qrSize = 76;
        }

        for (
            let i = 0;
            i < dogs.length;
            i++
        ) {
            const dog =
                dogs[i];

            const row =
                Math.floor(
                    i /
                    columns
                );

            const col =
                i %
                columns;

            const centerX =
                startX +
                col *
                    cellWidth +
                cellWidth /
                    2;

            const cellTop =
                gridTop +
                row *
                    rowHeight;

            const qrX =
                centerX -
                qrSize / 2;

            const qrY =
                cellTop;

            const qr =
                createQrDataUrl(
                    dog.profileUrl
                );

            pdf.addImage(
                qr,
                'PNG',
                qrX,
                qrY,
                qrSize,
                qrSize
            );

            const puppyName =
                getPuppyName(
                    dog,
                    page.litterName
                );

            pdf.setTextColor(
                ...DARK
            );

            pdf.setFont(
                'helvetica',
                'bold'
            );

            pdf.setFontSize(
                fitFontSize(
                    pdf,
                    puppyName,
                    20,
                    cellWidth - 14,
                    13
                )
            );

            pdf.text(
                puppyName,
                centerX,
                qrY +
                    qrSize +
                    24,
                {
                    align:
                        'center'
                }
            );

            pdf.setFont(
                'helvetica',
                'normal'
            );

            pdf.setFontSize(
                11
            );

            pdf.setTextColor(
                100,
                100,
                100
            );

            pdf.text(
                dog.sex,
                centerX,
                qrY +
                    qrSize +
                    41,
                {
                    align:
                        'center'
                }
            );
        }

        drawAfhFooter(
            pdf
        );
    }

    // =========================================================================
    // BACKGROUND / PAWS
    // =========================================================================

    function drawBackground(
        pdf
    ) {
        pdf.setFillColor(
            255,
            255,
            255
        );

        pdf.rect(
            0,
            0,
            PAGE_WIDTH,
            PAGE_HEIGHT,
            'F'
        );

        // Similar rough positions to Leslie's sample.

        drawPaw(
            pdf,
            115,
            42,
            0.78,
            -10
        );

        drawPaw(
            pdf,
            55,
            135,
            0.72,
            -20
        );

        drawPaw(
            pdf,
            130,
            128,
            0.72,
            10
        );

        drawPaw(
            pdf,
            75,
            235,
            0.72,
            -10
        );

        drawPaw(
            pdf,
            735,
            295,
            0.72,
            15
        );

        drawPaw(
            pdf,
            650,
            395,
            0.70,
            15
        );

        drawPaw(
            pdf,
            745,
            390,
            0.72,
            -10
        );

        drawPaw(
            pdf,
            670,
            500,
            0.74,
            10
        );
    }

    function drawPaw(
        pdf,
        x,
        y,
        scale = 1,
        rotation = 0
    ) {
        pdf.saveGraphicsState();

        pdf.setFillColor(
            ...GRAY
        );

        // jsPDF doesn't conveniently rotate grouped vector shapes,
        // so the position pattern provides the decorative variation.

        const s =
            14 * scale;

        // Main pad
        pdf.ellipse(
            x,
            y + 13 * scale,
            s,
            11 * scale,
            'F'
        );

        // Toes
        pdf.ellipse(
            x - 14 * scale,
            y - 4 * scale,
            6 * scale,
            8 * scale,
            'F'
        );

        pdf.ellipse(
            x - 5 * scale,
            y - 13 * scale,
            6 * scale,
            9 * scale,
            'F'
        );

        pdf.ellipse(
            x + 6 * scale,
            y - 13 * scale,
            6 * scale,
            9 * scale,
            'F'
        );

        pdf.ellipse(
            x + 15 * scale,
            y - 3 * scale,
            6 * scale,
            8 * scale,
            'F'
        );

        pdf.restoreGraphicsState();
    }

    // =========================================================================
    // AFH FOOTER
    // =========================================================================

    function drawAfhFooter(
        pdf
    ) {
        // Until Leslie sends the source template/logo,
        // this uses a clean text recreation rather than embedding
        // an unofficial or low-resolution logo image.

        pdf.setTextColor(
            25,
            25,
            25
        );

        // Little orange roof/dog accent.
        pdf.setDrawColor(
            240,
            125,
            25
        );

        pdf.setLineWidth(
            2
        );

        pdf.line(
            373,
            570,
            396,
            550
        );

        pdf.line(
            396,
            550,
            419,
            570
        );

        pdf.setFont(
            'helvetica',
            'bold'
        );

        pdf.setFontSize(12);

        pdf.text(
            'A Forever Home',
            PAGE_WIDTH / 2,
            578,
            {
                align:
                    'center'
            }
        );

        pdf.setFont(
            'helvetica',
            'normal'
        );

        pdf.setFontSize(6.5);

        pdf.setTextColor(
            100,
            100,
            100
        );

        pdf.text(
            'RESCUE FOUNDATION',
            PAGE_WIDTH / 2,
            587,
            {
                align:
                    'center'
            }
        );
    }

    // =========================================================================
    // QR CODE
    // =========================================================================

    function createQrDataUrl(
        url
    ) {
        const qr =
            qrcode(
                0,
                'H'
            );

        qr.addData(url);
        qr.make();

        const modules =
            qr.getModuleCount();

        const moduleSize = 8;
        const quietZone = 4;

        const total =
            modules +
            quietZone * 2;

        const canvas =
            document.createElement(
                'canvas'
            );

        canvas.width =
            total *
            moduleSize;

        canvas.height =
            total *
            moduleSize;

        const ctx =
            canvas.getContext(
                '2d'
            );

        ctx.fillStyle =
            '#ffffff';

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.fillStyle =
            '#000000';

        for (
            let row = 0;
            row < modules;
            row++
        ) {
            for (
                let col = 0;
                col < modules;
                col++
            ) {
                if (
                    qr.isDark(
                        row,
                        col
                    )
                ) {
                    ctx.fillRect(
                        (
                            col +
                            quietZone
                        ) *
                            moduleSize,
                        (
                            row +
                            quietZone
                        ) *
                            moduleSize,
                        moduleSize,
                        moduleSize
                    );
                }
            }
        }

        return canvas.toDataURL(
            'image/png'
        );
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function getPuppyName(
        dog,
        litterName
    ) {
        if (
            dog.name.startsWith(
                litterName + ' '
            )
        ) {
            return dog.name
                .slice(
                    litterName.length +
                    1
                )
                .trim();
        }

        return dog.name;
    }

    function fitFontSize(
        pdf,
        text,
        preferred,
        maximumWidth,
        minimum
    ) {
        let size =
            preferred;

        while (
            size > minimum
        ) {
            pdf.setFontSize(
                size
            );

            const width =
                pdf.getTextWidth(
                    text
                );

            if (
                width <=
                maximumWidth
            ) {
                return size;
            }

            size--;
        }

        return minimum;
    }

    function formatBirthDate(
        date
    ) {
        // Keep the AFH mm/dd/yyyy style,
        // but remove leading zeroes to match Leslie's example.

        const parts =
            date.split('/');

        if (
            parts.length !== 3
        ) {
            return date;
        }

        return (
            Number(parts[0]) +
            '/' +
            Number(parts[1]) +
            '/' +
            parts[2]
        );
    }

    function normalizeText(
        value
    ) {
        return String(
            value || ''
        )
            .replace(
                /\u00a0/g,
                ' '
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }

    function capitalize(
        value
    ) {
        const text =
            String(
                value || ''
            );

        if (!text) {
            return '';
        }

        return (
            text.charAt(0)
                .toUpperCase() +
            text.slice(1)
                .toLowerCase()
        );
    }

    function dedupeById(
        dogs
    ) {
        const map =
            new Map();

        for (
            const dog of dogs
        ) {
            if (
                !map.has(
                    dog.id
                )
            ) {
                map.set(
                    dog.id,
                    dog
                );
            }
        }

        return Array.from(
            map.values()
        );
    }

    function sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    function setButton(
        text,
        disabled
    ) {
        button.textContent =
            text;

        button.disabled =
            disabled;

        button.style.opacity =
            disabled
                ? '0.82'
                : '1';

        button.style.cursor =
            disabled
                ? 'wait'
                : 'pointer';
    }

    function getLocalDateString() {
        const date =
            new Date();

        return [
            date.getFullYear(),
            String(
                date.getMonth() +
                1
            ).padStart(
                2,
                '0'
            ),
            String(
                date.getDate()
            ).padStart(
                2,
                '0'
            )
        ].join('-');
    }

    // =========================================================================
    // STARTUP
    // =========================================================================

    console.log(
        `%cAFH PDF Sign Generator v${VERSION} loaded.`,
        'color:#17365d;font-weight:bold;font-size:14px;'
    );

})();