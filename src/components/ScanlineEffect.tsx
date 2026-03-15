const ScanlineEffect = () => {
    return (
        <>
            {/* CRT Scanline Effect */}
            <div className="scanlines pointer-events-none fixed inset-0 z-50" />

            {/* CRT Glow Effect */}
            <div className="crt-glow pointer-events-none fixed inset-0 z-40" />
        </>
    );
};

export default ScanlineEffect;
