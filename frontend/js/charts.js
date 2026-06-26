window.HelioScout = window.HelioScout || {};

/**
 * Chart rendering logic using Chart.js
 */
HelioScout.Charts = (function() {
    let monthlyChartInstance = null;
    let radarChartInstance = null;

    // Standard styling matching our CSS variables
    const colors = {
        solar: 'rgba(245, 158, 11, 1)',   // #f59e0b
        solarBg: 'rgba(245, 158, 11, 0.2)',
        wind: 'rgba(6, 182, 212, 1)',     // #06b6d4
        windBg: 'rgba(6, 182, 212, 0.2)',
        csp: 'rgba(249, 115, 22, 1)',     // #f97316
        text: '#94a3b8',
        grid: 'rgba(255, 255, 255, 0.06)'
    };

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colors.text, font: { family: 'Libre Franklin', size: 11 } }
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                titleFont: { family: 'Libre Franklin', size: 12 },
                bodyFont: { family: 'Libre Franklin', size: 12 },
                padding: 10,
                cornerRadius: 8,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }
        }
    };

    return {
        /**
         * Render the Monthly Resource Profile (Bar Chart)
         */
        renderMonthlyChart(canvasId, solarProfile, windProfile) {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;

            if (monthlyChartInstance) {
                monthlyChartInstance.destroy();
            }

            const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            // Normalize data to percentage for comparison on same axis, or use dual axes
            // We'll use dual Y-axes for better readability
            
            monthlyChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Solar Insolation (kWh/m²/day)',
                            data: solarProfile || Array(12).fill(0),
                            backgroundColor: colors.solarBg,
                            borderColor: colors.solar,
                            borderWidth: 1,
                            borderRadius: 4,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    ...commonOptions,
                    scales: {
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: { color: colors.text, font: { size: 10 } }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            grid: { color: colors.grid, drawBorder: false },
                            ticks: { color: colors.text, font: { size: 10 } },
                            title: { display: true, text: 'Solar', color: colors.text, font: { size: 10 } }
                        }
                    }
                }
            });
        },

        /**
         * Render the Resource Radar (Spider Chart)
         */
        renderRadarChart(canvasId, scores) {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;

            if (radarChartInstance) {
                radarChartInstance.destroy();
            }

            radarChartInstance = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Solar PV', 'Wind', 'CSP'],
                    datasets: [{
                        label: 'Resource Score',
                        data: [
                            scores.solar || 0,
                            scores.wind || 0,
                            scores.csp || 0
                        ],
                        backgroundColor: 'rgba(16, 185, 129, 0.2)', // financial-500 tint
                        borderColor: 'rgba(16, 185, 129, 1)',
                        pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(16, 185, 129, 1)'
                    }]
                },
                options: {
                    ...commonOptions,
                    scales: {
                        r: {
                            angleLines: { color: colors.grid },
                            grid: { color: colors.grid },
                            pointLabels: { color: colors.text, font: { family: 'Libre Franklin', size: 11, weight: '600' } },
                            ticks: { display: false, min: 0, max: 100 }
                        }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }
    };
})();
