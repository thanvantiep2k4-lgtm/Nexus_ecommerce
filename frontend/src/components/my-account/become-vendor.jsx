import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useGetUserProfileQuery, useApplyVendorMutation } from '@/redux/features/auth/authApi';
import { notifySuccess, notifyError } from '@/utils/toast';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || 'http://localhost:8081';

// ── Status panel (pending / approved / rejected / suspended) ─────────
const StatusPanel = ({ vendorProfile, onReapply }) => {
  const { t } = useTranslation();
  const status = vendorProfile?.verificationStatus;

  return (
    <div className={`cl-vendor-status cl-vendor-status--${status}`}>
      <div className="cl-vendor-status__badge">{t(`vendorApply.status.${status}`)}</div>
      <h4 className="cl-vendor-status__title">{vendorProfile?.storeName}</h4>
      <p className="cl-vendor-status__desc">{t(`vendorApply.statusDesc.${status}`)}</p>
      {status === 'rejected' && vendorProfile?.rejectionReason && (
        <p className="cl-vendor-status__reason">
          {t('vendorApply.reason')}: {vendorProfile.rejectionReason}
        </p>
      )}
      {status === 'approved' && (
        <a className="cl-setting-save-btn" href={CRM_URL} target="_blank" rel="noreferrer">
          {t('vendorApply.openSellerCenter')}
        </a>
      )}
      {status === 'rejected' && (
        <button type="button" className="cl-setting-save-btn" onClick={onReapply}>
          {t('vendorApply.reapply')}
        </button>
      )}
    </div>
  );
};

// ── Application form ─────────────────────────────────────────────────
const BecomeVendor = () => {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useGetUserProfileQuery();
  const [applyVendor] = useApplyVendorMutation();
  const [showForm, setShowForm] = React.useState(false);

  const user = data?.data?.user || data?.data || {};
  const vendorProfile = user?.vendorProfile;
  const hasApplication = !!vendorProfile?.storeName && !!vendorProfile?.verificationStatus;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      storeName: vendorProfile?.storeName || '',
      storeDescription: vendorProfile?.storeDescription || '',
      bankName: '',
      accountNumber: '',
      accountName: '',
      branch: '',
    },
  });

  const onSubmit = async (values) => {
    try {
      await applyVendor({
        storeName: values.storeName.trim(),
        storeDescription: values.storeDescription,
        bankInfo: {
          bankName: values.bankName,
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          branch: values.branch,
        },
      }).unwrap();
      notifySuccess(t('vendorApply.submitted'));
      setShowForm(false);
      refetch();
    } catch (err) {
      notifyError(err?.data?.error?.message || err?.data?.message || t('vendorApply.failed'));
    }
  };

  if (isLoading) return null;

  return (
    <div className="cl-setting-section">
      <div className="cl-setting-section__title">{t('vendorApply.title')}</div>

      {hasApplication && !showForm ? (
        <StatusPanel vendorProfile={vendorProfile} onReapply={() => setShowForm(true)} />
      ) : (
        <>
          <ul className="cl-vendor-benefits">
            <li>{t('vendorApply.benefit1')}</li>
            <li>{t('vendorApply.benefit2')}</li>
            <li>{t('vendorApply.benefit3')}</li>
          </ul>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="row g-3">
              <div className="col-12">
                <div className="cl-setting-field">
                  <label>{t('vendorApply.storeName')} *</label>
                  <input
                    {...register('storeName', { required: true, minLength: 2, maxLength: 100 })}
                    placeholder={t('vendorApply.storeNamePlaceholder')}
                  />
                  {errors.storeName && (
                    <span className="cl-vendor-error">{t('vendorApply.storeNameRequired')}</span>
                  )}
                </div>
              </div>
              <div className="col-12">
                <div className="cl-setting-field">
                  <label>{t('vendorApply.storeDescription')}</label>
                  <textarea
                    className="cl-vendor-textarea"
                    rows={4}
                    {...register('storeDescription', { maxLength: 1000 })}
                    placeholder={t('vendorApply.storeDescriptionPlaceholder')}
                  />
                </div>
              </div>
            </div>

            <div className="cl-vendor-subtitle">{t('vendorApply.bankInfo')}</div>
            <div className="row g-3">
              <div className="col-md-6">
                <div className="cl-setting-field">
                  <label>{t('vendorApply.bankName')}</label>
                  <input {...register('bankName')} placeholder="Vietcombank" />
                </div>
              </div>
              <div className="col-md-6">
                <div className="cl-setting-field">
                  <label>{t('vendorApply.branch')}</label>
                  <input {...register('branch')} />
                </div>
              </div>
              <div className="col-md-6">
                <div className="cl-setting-field">
                  <label>{t('vendorApply.accountNumber')}</label>
                  <input {...register('accountNumber')} />
                </div>
              </div>
              <div className="col-md-6">
                <div className="cl-setting-field">
                  <label>{t('vendorApply.accountName')}</label>
                  <input {...register('accountName')} />
                </div>
              </div>
            </div>

            <button type="submit" className="cl-setting-save-btn" disabled={isSubmitting}>
              {isSubmitting ? t('profile.saving') : t('vendorApply.submit')}
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default BecomeVendor;
